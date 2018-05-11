/** @babel */
/* global window atom console Promise Map */

import {CompositeDisposable, Disposable, Point, Range} from 'atom'

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
        this.createContextMenu()

        const menuToggleOpen  = () => { this.menuOpen = true }
        const menuToggleClose = () => { this.menuOpen = false }

        window.addEventListener('contextmenu', menuToggleOpen, false)
        window.addEventListener('mousemove', menuToggleClose, false)

        this.disposables.add(new Disposable(() => {
            window.removeEventListener('contextmenu', menuToggleOpen)
            window.removeEventListener('mousemove', menuToggleClose)
        }))
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
                    "label": "Run Test Method",
                    "command": "php-unit-integrator:run-test-method",
                    shouldDisplay: (event) => {
                        const editor = atom.workspace.getActiveTextEditor()

                        this.currentScope = this.proxy.getScopeForEvent(editor, event)

                        return this.currentScope && this.currentScope.getMethodName()
                    }
                }, {
                    "label": "Run Test Class",
                    "command": "php-unit-integrator:run-test-class",
                    shouldDisplay: (event) => {
                        const editor = atom.workspace.getActiveTextEditor()

                        this.currentScope = this.proxy.getScopeForEvent(editor, event)

                        return !!this.currentScope
                    }
                }, {
                    "label": "Go to Test Method",
                    "command": "php-unit-integrator:goto-test-method",
                    shouldDisplay: (event) => {
                        const editor = atom.workspace.getActiveTextEditor()

                        this.currentScope = this.proxy.getScopeForEvent(editor, event)

                        return this.currentScope && this.currentScope.getMethodName() && !this.currentScope.isTestFile()
                    }
                }, {
                    "label": "Go to Test Class",
                    "command": "php-unit-integrator:goto-test-class",
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
        const getScopes = async (isMethod) => {
            let scope = this.menuOpen
                ? this.currentScope
                : this.proxy.getScopeForCursor(atom.workspace.getActiveTextEditor())

            if (!scope) {
                return
            }

            if (!scope.isTestFile()) {
                const source = scope.clone(isMethod)
                const target = await this.proxy.resolveTarget(source)

                return {source, target}
            }

            return {target: scope}
        }

        const validateAndOpen = async (isMethod) => {
            try {
                const scope = await getScopes(isMethod)

                if (scope.target) {
                    return await this.openTest(scope.source, scope.target)
                }
            } catch (error) {
                if ('cancelled' !== error) {
                    throw error
                }
            }
        }

        const validateAndRun = async (isMethod) => {
            try {
                const scope = await getScopes(isMethod)

                if (!scope || !scope.target) {
                    console.log('registerCommandHandlers::validate Failed to find a target scope')
                    return
                }

                if (!scope.target.exists()) {
                    return await this.openTest(scope.source, scope.target)
                }

                if (isMethod) {
                    await this.projectTester.runTestMethod({scope: scope.target})
                } else {
                    await this.projectTester.runTestClass({scope: scope.target})
                }
            } catch (error) {
                if ('cancelled' !== error) {
                    throw error
                }
            }
        }

        const register = (context) => {
            if (!this.commandHandlers.has(context)) {
                this.commandHandlers.set(context, atom.commands.add(context, {
                    'php-unit-integrator:goto-test-method': () => validateAndOpen(true),
                    'php-unit-integrator:goto-test-class': () => validateAndOpen(false),

                    'php-unit-integrator:run-test-suite': () => this.projectTester.runTestSuite(),
                    'php-unit-integrator:run-test-file': () => this.projectTester.runTestFile(),
                    "php-unit-integrator:run-test-all-suites": () => this.projectTester.runAllTestSuites(),
                    "php-unit-integrator:run-test-all-files": () => this.projectTester.runAllTestFiles(),
                    "php-unit-integrator:run-test-class": () => validateAndRun(false),
                    "php-unit-integrator:run-test-method": () => validateAndRun(true),
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
        let fileLine

        try {
            if (source.getMethodRange()) {
                if (!target.getMethodRange()) {
                    return this.promptToCreate(source, target, options)
                }

                fileLine = target.getMethodRange().start.row
            } else if (!target.getClassRange()) {
                return this.promptToCreate(source, target, options)
            } else {
                fileLine = target.getClassRange().start.row
            }

            // Use await to catch the errors
            await openInAtom(target.getPath(), fileLine)

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
            text: typeof meta.text === 'string' ? meta.text : meta,
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
                insertPos = new Point(target.getClassRange().end.row - 1, 0)
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
