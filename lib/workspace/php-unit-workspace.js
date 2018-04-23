/** @babel */
/* global atom console Promise Map */

import {CompositeDisposable, Point, Range} from 'atom'

import {openInAtom, offsetRange, offsetPoint} from '../util/php-unit-utils'
import PhpUnitSkelgenView from '../views/php-unit-skelgen-view'
import PhpUnitProjectManager from '../project/php-unit-project-manager'
import PhpUnitTestRunner from '../tester/php-unit-test-runner'
import PhpUnitConfig from './php-unit-config'
import PhpUnitProxy from '../proxy/php-unit-proxy'

export default class PhpUnitWorkspace
{
    /**
     * Initializes the instance
     *
     * @constructor
     * @param {PhpUnitProxy} proxy - The layer which generates files scopes
     */
    constructor () {
        this.packageConfig = new PhpUnitConfig()
        this.projectManager = new PhpUnitProjectManager(this.packageConfig)
        this.proxy = new PhpUnitProxy(this.projectManager)
        this.projectTester = new PhpUnitTestRunner(this.packageConfig, this.projectManager, this.proxy)
        this.disposables = new CompositeDisposable()

        this.commandHandlers = new Map()

        this.registerCommandHandlers()
    }

    /**
     * Applies the php-integrator-base service to the proxy
     *
     * @param {PhpCoreService} service - The core service
     */
    setCoreService (service) {
        this.proxy.activate(service).then(() => {
            this.createContextMenu()
        })
    }

    /**
     * Destroys all internal references
     */
    destroy () {
        this.disposables.dispose()

        this.commandHandlers.forEach(disposable => disposable.dispose())
        this.commandHandlers.clear()
    }

    /**
     * Returns the global configuration for the package
     *
     * @return {PhpUnitConfig}
     */
    getPackageConfig () {
        return this.packageConfig
    }

    /**
     * Returns the package project manager
     *
     * @return {PhpUnitProjectManager}
     */
    getProjectManager () {
        return this.projectManager
    }

    /**
     * Returns the package project tester
     *
     * @return {PhpUnitTestRunner}
     */
    getProjectTester () {
        return this.projectTester
    }

    /**
     * Returns the proxy instance
     *
     * @return {PhpUnitProxy}
     */
    getProxy () {
        return this.proxy
    }

    /**
     * Adds the context menu items to the atom text editor
     *
     * @private
     */
    createContextMenu () {
        this.disposables.add(atom.contextMenu.add({
            "atom-text-editor": [
                {
                    "label": "Run TestCase",
                    "command": "php-unit-integrator:workspace-run-testcase",
                    shouldDisplay: (event) => {
                        const editor = atom.workspace.getActiveTextEditor()

                        this.currentScope = this.proxy.getScopeForEvent(editor, event)

                        return this.currentScope && this.currentScope.getMethodName() && this.currentScope.isTestFile()
                    }
                }, {
                    "label": "Run TestClass",
                    "command": "php-unit-integrator:workspace-run-testclass",
                    shouldDisplay: (event) => {
                        const editor = atom.workspace.getActiveTextEditor()

                        this.currentScope = this.proxy.getScopeForEvent(editor, event)

                        return this.currentScope && this.currentScope.isTestFile()
                    }
                }, {
                    "label": "Go to TestCase",
                    "command": "php-unit-integrator:workspace-goto-testcase",
                    shouldDisplay: (event) => {
                        const editor = atom.workspace.getActiveTextEditor()

                        this.currentScope = this.proxy.getScopeForEvent(editor, event)

                        return this.currentScope && this.currentScope.getMethodName() && !this.currentScope.isTestFile()
                    }
                }, {
                    "label": "Go to TestSuite",
                    "command": "php-unit-integrator:workspace-goto-testclass",
                    shouldDisplay: (event) => {
                        const editor = atom.workspace.getActiveTextEditor()

                        this.currentScope = this.proxy.getScopeForEvent(editor, event)

                        return this.currentScope && !this.currentScope.isTestFile()
                    }
                }, {
                    type: 'separator'
                }
            ]
        }))

        // Shift menu items to the front
        atom.contextMenu.itemSets.unshift(atom.contextMenu.itemSets.pop())

    }

    /**
     * Adds a handler for each of the atom commands
     *
     * @private
     */
    registerCommandHandlers () {
        const validateAndOpen = async (shouldClone) => {
            if (!this.currentScope) {
                console.error('openTest: Failed to find a valid source')
            } else {
                try {
                    const source = this.currentScope.clone(shouldClone)
                    const target = await this.proxy.resolveTarget(source)

                    if (target) {
                        return await this.openTest(source, target)
                    }
                } catch (error) {
                    if ('cancelled' !== error) {
                        throw error
                    }
                }
            }
        }

        const validateAndRun = async (isMethod) => {
            if (!this.currentScope) {
                console.error('openTest: Failed to find a valid source')
            } else {
                const action = isMethod ? 'runTestMethod' : 'runTestClass'

                try {
                    await this.projectTester[action]({scope: this.currentScope})
                } catch (error) {
                    if ('cancelled' !== error) {
                        throw error
                    }
                }
            }
        }

        const register = (context) => {
            if (!this.commandHandlers.has(context)) {
                this.commandHandlers.set(context, atom.commands.add(context, {
                    'php-unit-integrator:workspace-run-testcase': () => validateAndRun(true),
                    'php-unit-integrator:workspace-run-testclass': () => validateAndRun(false),

                    'php-unit-integrator:workspace-goto-testcase': () => validateAndOpen(true),
                    'php-unit-integrator:workspace-goto-testclass': () => validateAndOpen(false),

                    'php-unit-integrator:run-test-suite': () => this.projectTester.runTestSuite(),
                    'php-unit-integrator:run-test-file': () => this.projectTester.runTestFile(),
                    "php-unit-integrator:run-test-all-suites": () => this.projectTester.runAllTestSuites(),
                    "php-unit-integrator:run-test-all-files": () => this.projectTester.runAllTestFiles(),
                    "php-unit-integrator:run-test-class": () => this.projectTester.runTestClass(),
                    "php-unit-integrator:run-test-method": () => this.projectTester.runTestMethod(),
                }))
            }
        }

        const registerProjects = (projects) => {
            for (const project of projects) {
                register(project.getEditorContext())
            }
        }

        this.disposables.add(this.projectManager.onDidProjectsChange(registerProjects))

        registerProjects(this.projectManager.getProjects())
    }

    /**
     * The context menu command handler
     *
     * @private
     * @param  {PhpUnitScope} gotoMethod - The source file scope
     * @param  {Object}       [options]  - Open/Create options
     *
     * @return {Promise}                 - Resolves with nothing
     */
    async openTest (source, target, options = {}) {
        let fileRow

        try {
            if (source.getMethodRange()) {
                if (!target.getMethodRange()) {
                    return this.promptToCreate(source, target, options)
                }

                fileRow = target.getMethodRange().start.row
            } else if (!target.getClassRange()) {
                return this.promptToCreate(source, target, options)
            } else {
                fileRow = target.getClassRange().start.row
            }

            // Use await to catch the errors
            await openInAtom(target.getPath(), fileRow)

            return target
        } catch (error) {
            console.error(error)
        }
    }

    /**
     * Creates a modal dialog asking user if they want to create the class/method
     *
     * @param  {Object} source      - the source meta
     * @param  {Object} target      - the target meta
     * @param  {Object} [classInfo] - the database query result
     *
     * @return {Promise}            - Resolves with nothing
     */
    async promptToCreate (source, target, options) {
        if (options && options.shouldCreate === false) {
            return Promise.reject('aborted')
        }

        if (options && typeof options.onWillCreate === 'function') {
            options.onWillCreate(target.clone())
        }

        if (!this.promptView) {
            this.promptView = new PhpUnitSkelgenView()
        }

        const deferred = {}

        deferred.promise = new Promise((resolve, reject) => {
            deferred.resolve = resolve
            deferred.reject = reject
        })

        const handler = async (result) => {
            if (!result) {
                return deferred.reject('cancelled')
            }

            await this.generateTestCase(source, target)

            if (options && typeof options.onDidCreate === 'function') {
                options.onDidCreate(target.clone())
            }

            deferred.resolve(target)
        }

        this.promptView.open(target, handler)

        return deferred.promise
    }

    /**
     * Helper method for cursor/selection positioning in test file
     *
     * @private
     * @param  {Object} meta          - the content about to be rendered
     * @param  {Number} [startLine=0] - the insertion position within the file
     *
     * @return {Object}               - the adjusted text cursor and selection range
     */
    offsetCursor (meta, start) {
        const cursor = start.copy()
        const select = new Range(start.copy(), start.copy())

        if (meta.cursor) {
            offsetPoint(cursor, meta.cursor, false)
        }

        if (meta.select) {
            offsetRange(select, meta.select, false)
        }

        return {
            text: typeof meta.text === 'string'
                ? meta.text
                : meta,
            cursor,
            select
        }
    }

    /**
     * Appends a new test case method to an existing test suite
     *
     * @private
     * @param  {Object}  source      - the source meta data
     * @param  {Object}  target      - the target meta data
     * @param  {Object}  [classInfo] - the database query result
     *
     * @return {Promise}             - Resolves with nothing
     */
    async generateTestCase (source, target) {
        try {
            var meta,
                insertPos

            const editor = await atom.workspace.open(target.path)
            const adapter = source.getProject().getAdapter()

            if (!target.getClassRange()) {
                await editor.save()
                meta = await adapter.createTestSuite(source, target)
                insertPos = new Point(0, 0)
            } else {
                meta = await adapter.createTestCase(source, target)
                insertPos = target.getClassRange().end.copy()
                insertPos.row -= 1
            }

            const {text, cursor, select} = this.offsetCursor(meta, insertPos)

            editor.setTextInBufferRange(new Range(insertPos, insertPos), text)

            if (!select.isEmpty()) {
                editor.setSelectedBufferRange(select)
            } else {
                editor.setCursorBufferPosition(cursor)
            }

            editor.scrollToCursorPosition()

        } catch (error) {
            console.error(error)
        }
    }
}
