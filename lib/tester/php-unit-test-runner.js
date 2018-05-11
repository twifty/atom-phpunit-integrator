/** @babel */
/* global atom console */

import {Emitter} from 'atom'

import {openInAtom} from '../util/php-unit-utils'
import PhpUnitProject from '../project/php-unit-project'
import PhpUnitTestQueue from './php-unit-test-queue'
import CancelablePromise from '../util/cancelable-promise'

export default class PhpUnitTestRunner
{
    /**
     * Constructor
     *
     * @constructor
     * @param {PhpUnitConfig}         packageConfig  - The package config
     * @param {PhpUnitProjectManager} projectManager - The package project manager
     * @param {PhpUnitProxy}          proxy          - The proxy
     */
    constructor (packageConfig, projectManager, proxy) {
        this.config = packageConfig
        this.projectManager = projectManager
        this.proxy = proxy
        this.emitter = new Emitter()
        this.running = false
    }

    /**
     * Destructor
     */
    destroy () {
        this.emitter.dispose()
        this.config = null
        this.projectManager = null
        this.proxy = null
    }

    /**
     * Returns the main project manager
     *
     * @return {PhpUnitProjectManager}
     */
    getProjectManager () {
        return this.projectManager
    }

    /**
     * Registers a listener to the clear all event
     *
     * @param  {Function} cb - The listeners callback
     *
     * @return {Disposable}
     */
    onClearAll (cb) {
        return this.emitter.on('clear-all', cb)
    }

    /**
     * Registers a listener for when a batch test begins
     *
     * The callback will be invoked with:
     * 		@param {Object}         event
     * 		@param {PhpUnitProject} event.project - The project being tested
     * 		@param {Number}         event.count   - The number of test to be run
     *
     * @param  {Function} cb - The listeners callback
     *
     * @return {Disposable}
     */
    onWillBeginBatchTest (cb) {
        return this.emitter.on('test-begin-batch', cb)
    }

    /**
     * Registers a listener for when a batch test ends
     *
     * The callback will be invoked with:
     * 		@param {Object}         event
     * 		@param {PhpUnitProject} event.project   - The project being tested
     *
     * @param  {Function} cb - The listeners callback
     *
     * @return {Disposable}
     */
    onDidCompleteBatchTest (cb) {
        return this.emitter.on('test-complete-batch', cb)
    }

    /**
     * Registers a listener for when a single test begins
     *
     * The callback will be invoked with:
     * 		@param {Object}         event
     * 		@param {PhpUnitProject} event.project - The project being tested
     *
     * @param  {Function} cb - The listeners callback
     *
     * @return {Disposable}
     */
    onDidBeginTest (cb) {
        return this.emitter.on('test-begin', cb)
    }

    /**
     * Registers a listener for when a single test ends
     *
     * The callback will be invoked with:
     * 		@param {Object}         event
     * 		@param {PhpUnitProject} event.project - The project being tested
     *
     * @param  {Function}   cb - The listeners callback
     *
     * @return {Disposable}
     */
    onDidCompleteTest (cb) {
        return this.emitter.on('test-complete', cb)
    }

    /**
     * Registers a listener for when the test queue is cancelled
     *
     * The callback will be invoked with:
     * 		@param {Object}         event
     * 		@param {PhpUnitProject} event.project - The project being tested
     *
     * @param  {Function}   cb - The listeners callback
     *
     * @return {Disposable}
     */
    onDidCancelTest (cb) {
        return this.emitter.on('tests-cancelled', cb)
    }

    /**
     * Registers a listener for the runtimes command line
     *
     * The callback will be invoked with:
     * 		@param {Object}         event
     * 		@param {PhpUnitProject} event.project - The project being tested
     * 		@param {String}         event.data    - The command line
     *
     * @param  {Function} cb - The listeners callback
     *
     * @return {Disposable}
     */
    onTestCommandLine (cb) {
        return this.emitter.on('test-command-line', cb)
    }

    /**
     * Registers a listener for the runtimes stdout stream
     *
     * The callback will be invoked with:
     * 		@param {Object}         event
     * 		@param {PhpUnitProject} event.project - The project being tested
     * 		@param {String}         event.data    - The stdout data
     *
     * @param  {Function} cb - The listeners callback
     *
     * @return {Disposable}
     */
    onTestOutputData (cb) {
        return this.emitter.on('test-output-data', cb)
    }

    /**
     * Registers a listener for the runtimes stderr stream
     *
     * The callback will be invoked with:
     * 		@param {Object}         event
     * 		@param {PhpUnitProject} event.project - The project being tested
     * 		@param {String}         event.data    - The stderr data
     *
     * @param  {Function} cb - The listeners callback
     *
     * @return {Disposable}
     */
    onTestErrorData (cb) {
        return this.emitter.on('test-error-data', cb)
    }

    /**
     * Informs all listeners to clear all views and cache
     *
     * @return {Promise} - Resolves when all listeners have completed
     */
    async clearAll () {
        try {
            for (const project of this.projectManager.getProjects()) {
                await project.clear()
            }

            await this.emitter.emitAsync('clear-all')
        } catch (error) {
            console.error(error)
        }
    }

    /**
     * Runs a single named test suite
     *
     * @param  {Object}	                [options]        - The test runner options
     * @param  {PhpUnitProject|String}  [project=null]   - The project to run, defaults to active text editor owner
     * @param  {String}                 [suiteName=null] - Uses the projects configured default if not given
     * @param  {Object}                 [filter]         - A map of class name to class methods
     *
     * @return {Promise}                                 - Resolves when the test has finished
     */
    async runTestSuite ({project = null, suiteNames = null, filter = {}} = {}) {
        try {
            const resolved = await this.resolveOptions({project})
            const suites = resolved.project.getAvailableSuiteNames()

            if (null === suiteNames) {
                suiteNames = resolved.project.getSelectedSuiteNames()
            } else if (!Array.isArray(suiteNames)) {
                suiteNames = [suiteNames]
            }

            for (const suiteName of suiteNames) {
                if (-1 === suites.indexOf(suiteName)) {
                    throw new Error(`TestSuite '${suiteName}' does not belong to project (${project.getRoot()})`)
                }
            }

            if (0 === suiteNames.length) {
                suiteNames = null
            }

            resolved.project.clear()

            return this.run(resolved.project, suiteNames, filter)
        } catch (error) {
            console.error(error)
        }
    }

    /**
     * Runs all named test suites
     *
     * @param  {Object}	                [options]        - The test runner options
     * @param  {PhpUnitProject|String}  [project=null]   - The project to run, defaults to active text editor owner
     *
     * @return {Promise}                                 - Resolves when the test has finished
     */
    async runAllTestSuites ({project = null} = {}) {
        try {
            const resolved = await this.resolveOptions({project})
            const suites = resolved.project.getAvailableSuiteNames()

            resolved.project.clear()

            return this.run(resolved.project, suites)
        } catch (error) {
            console.error(error)
        }
    }

    /**
     * Runs a single file
     *
     * @param  {Object}	                [options]        - The test runner options
     * @param  {PhpUnitProject|String}  [project=null]   - The project to run, defaults to active text editor owner
     * @param  {String}                 [path=null]      - The file to run, defaults to active test editor
     *
     * @return {Promise}                                 - Resolves when the test has finished
     */
    async runTestFile ({project = null, path = null} = {}) {
        try {
            const resolved = await this.resolveOptions({project, path})

            const scopes = await this.proxy.getClassScopesForFile(resolved.path)
            const filter = {}

            if (!scopes) {
                return
            }

            for (let scope of scopes) {
                if (!scope.isTestFile()) {
                    scope = await this.proxy.resolveTestClass(scope)

                    if (!scope) {
                        console.log('No Test File Found!')
                        return
                    }
                }

                const className = scope.getFullClassName()

                filter[className] = []
            }

            resolved.project.clear()

            if (this.config.get('goto-test')) {
                await openInAtom(resolved.scope.getPath())
            }

            await this.run(resolved.project, null, filter)
        } catch (error) {
            console.error(error)
        }
    }

    /**
     * Runs all test files
     *
     * @param  {Object}	                [options]        - The test runner options
     * @param  {PhpUnitProject|String}  [project=null]   - The project to run, defaults to active text editor owner
     * @param  {String}                 [path=null]      - The directory to search, default to projects root 'tests' directory
     *
     * @return {Promise}                                 - Resolves when the test has finished
     */
    async runAllTestFiles ({project = null, path = null} = {}) {
        if (this.running) {
            console.log('A test is already in progress, wait your turn!')
            return
        }

        this.running = true

        try {
            const resolved = await this.resolveOptions({project, path})
            const queue = new PhpUnitTestQueue()

            resolved.project.clear()

            await this.emitter.emitAsync('test-begin-batch', {
                project: resolved.project,
                queue
            })

            for (const p of resolved.project.getTestClassPaths()) {
                const paths = await p

                for (const path of paths) {
                    const optionsResolver = this.proxy.getClassScopesForFile(path)
                        .then(scopes => {
                            if (!scopes) {
                                return null
                            }

                            const filter = {}

                            for (let scope of scopes) {
                                if (scope.isTestFile()) {
                                    const className = scope.getFullClassName()
                                    filter[className] = []
                                }
                            }

                            if (0 !== Object.keys(filter).length) {
                                return this.createTestOptions(resolved.project, filter)
                            }
                        })

                    this.appendTest(queue, resolved.project, null, optionsResolver)
                }
            }

            let cancelled = false

            await queue.execute().catch((error) => {
                if ('SIGKILL' !== error && 'Failure' !== error) {
                    throw error
                }

                cancelled = true
                this.emitter.emit('tests-cancelled', {project: resolved.project})
            })

            if (!cancelled) {
                await this.emitter.emitAsync('test-complete-batch', {
                    project: resolved.project,
                    queue
                })
            }
        } catch (error) {
            console.error(error)
        } finally {
            this.running = false
        }
    }

    /**
     * Runs a single class
     *
     * @param  {Object}	                [options]        - The test runner options
     * @param  {PhpUnitProject|String}  [project=null]   - The project to run, defaults to active text editor owner
     * @param  {PhpUnitScope}           [scope=null]     - The class to run, resolves className if not given
     * @param  {String}                 [className=null] - If this and scope not given, default to class under the active cursor
     *
     * @return {Promise}                                 - Resolves when the test has finished
     */
    async runTestClass ({project = null, scope = null, className = null} = {}) {
        try {
            const resolved = await this.resolveOptions({project, className, scope})
            const filter = {}

            if (!resolved.scope) {
                console.log('No Source Class Found!')
                return
            }

            if (!resolved.scope.isTestFile()) {
                resolved.scope = await this.proxy.resolveTestSuite(resolved.scope)
            }

            if (!resolved.scope || !resolved.scope.exists()) {
                console.log('No Test Class Found!')
                return
            }

            className = resolved.scope.getFullClassName()

            filter[className] = []

            resolved.project.clear()

            if (this.config.get('goto-test')) {
                await openInAtom(resolved.scope.getPath(), resolved.scope.getClassRange().start.row)
            }

            await this.run(resolved.project, null, filter)
        } catch (error) {
            console.error(error)
        }
    }

    /**
     * Runs a single class method
     *
     * @param  {Object}	                [options]         - The test runner options
     * @param  {PhpUnitProject|String}  [project=null]    - The project to run, defaults to active text editor owner
     * @param  {PhpUnitScope}           [scope=null]      - The class to run, resolves className if not given
     * @param  {String}                 [className=null]  - If this and scope not given, default to class under the active cursor
     * @param  {String}                 [methodName=null] - If this and scope not given, default to method under the active cursor
     *
     * @return {Promise}                                  - Resolves when the test has finished
     */
    async runTestMethod ({project = null, scope = null, className = null, methodName = null} = {}) {
        try {
            const resolved = await this.resolveOptions({project, className, methodName, scope})
            const filter = {}

            if (!resolved.scope) {
                console.log('No Source Method Found!')
                return
            }

            if (!resolved.scope.isTestFile()) {
                resolved.scope = await this.proxy.resolveTestMethod(resolved.scope)
            }

            if (!resolved.scope || !resolved.scope.exists()) {
                console.log('No Test Method Found!')
                return
            }

            className = resolved.scope.getFullClassName()
            methodName = resolved.scope.getMethodName()

            filter[className] = [
                methodName
            ]

            resolved.project.clear()

            if (this.config.get('goto-test')) {
                await openInAtom(resolved.scope.getPath(), resolved.scope.getMethodRange().start.row)
            }

            await this.run(resolved.project, null, filter)
        } catch (error) {
            console.error(error)
        }
    }

    /**
     * Appends a test factory to the given queue
     *
     * @param  {PhpUnitTestQueue} queue   - The test queue
     * @param  {PhpUnitProject}   project - The project being tested
     * @param  {String}           suite   - The name of the test suite
     * @param  {Object}           options - The test runner options
     */
    appendTest (queue, project, suite, options) {
        const factory = () => {
            let runningTest = null

            const onExecute = async (resolve, reject) => {
                if (typeof options.then === 'function') {
                    options = await options

                    if (null == options) {
                        return resolve()
                    }
                }

                options = Object.assign({}, options, {suite})

                try {
                    await this.emitter.emitAsync('test-begin', {project, queue})

                    runningTest = project.runTest(options)

                    const result = await runningTest

                    await this.emitter.emitAsync('test-complete', {project, queue})

                    resolve(result)
                } catch (error) {
                    reject(error)
                } finally {
                    runningTest = null
                }
            }

            const onCancel = () => {
                if (runningTest) {
                    runningTest.cancel()
                }
            }

            return new CancelablePromise(onExecute, onCancel)
        }

        queue.push(factory)
    }

    /**
     * Generates the options required for running a test
     *
     * @param  {PhpUnitProject} project  - The project being tested
     * @param  {Object}         [filter] - Class name to method map
     *
     * @return {Object}                  - The combined options
     */
    createTestOptions (project, filter = {}) {
        return Object.assign({filter}, {
            onCmdLine: (data) => {
                this.emitter.emit('test-command-line', {project, data})
            },
            onOutData: (data) => {
                this.emitter.emit('test-output-data', {project, data})
            },
            onErrData: (data) => {
                this.emitter.emit('test-error-data', {project, data})
            },
        })
    }

    /**
     * Runs the configured test(s)
     *
     * @private
     * @param  {PhpUnitProject}   project     - The project being tested
     * @param  {Array<String>}    [suites=[]] - One or more named suites to run
     * @param  {Object}           [filter={}] - A map of class names to method names
     * @param  {PhpUnitTestQueue} [queue]     - An existing batch job to add the test to
     *
     * @return {PhpUnitTestQueue}             - Resolves when the test has finished
     */
    run (project, suites = [], filter = {}) {
        if (this.running) {
            console.log('A test is already in progress, wait your turn!')
            return
        }

        this.running = true

        const options = this.createTestOptions(project, filter)
        const queue = new PhpUnitTestQueue()

        if (!Array.isArray(suites)) {
            this.appendTest(queue, project, suites, options)
        }
        else if (1 === suites.length) {
            this.appendTest(queue, project, suites[0], options)
        }
        else {
            queue.push(() => {
                return this.emitter.emitAsync('test-begin-batch', {
                    project,
                    count: suites.length,
                    queue
                })
            })

            for (const suite of suites) {
                this.appendTest(queue, project, suite, options)
            }

            queue.push(() => {
                return this.emitter.emitAsync('test-complete-batch', {
                    project,
                    queue
                })
            })
        }

        return queue.execute().catch(error => {
            if ('SIGKILL' !== error && 'Failure' !== error) {
                throw error
            }

            this.emitter.emit('tests-cancelled', {project})
        })
        .finally(() => {
            this.running = false
        })
    }

    /**
     * Attempts to resolve unknown options
     *
     * @param  {String}       [project]    - The project path
     * @param  {String}       [path]       - The class file path
     * @param  {String}       [className]  - The name of a class
     * @param  {String}       [methodName] - The name of a class method
     * @param  {PhpUnitScope} [scope]      - A scope to verify against the project
     *
     * @return {Promise}            [description]
     */
    async resolveOptions ({project, path = null, className = null, methodName = null, scope = null}) {
        const editor = atom.workspace.getActiveTextEditor()

        let resolvedProject = project
        let resolvedProjectFrom = 'project'
        let resolvedPath = path
        let resolvedPathFrom = 'options.'
        let resolvedScope = scope

        if (typeof project === 'string') {
            resolvedProject = this.projectManager.getProject(project)
        } else if (null == project) {
            if (typeof path === 'string') {
                resolvedProject = this.projectManager.getProject(path)
                resolvedProjectFrom = 'path'
            } else {
                resolvedProject = this.projectManager.getProjectForEditor(editor)
                resolvedProjectFrom = 'TextEditor'
            }
        }

        if (!(resolvedProject instanceof PhpUnitProject)) {
            throw new Error(`Cannot resolve ${resolvedProjectFrom} (${project}) to a valid Project`)
        }

        if (null === resolvedScope) {
            if (null !== className) {
                if (null !== methodName) {
                    resolvedScope = await this.proxy.getScopeForMethod(path, className, methodName)
                } else {
                    resolvedScope = await this.proxy.getScopeForClass(path, className)
                }

                if (null == resolvedScope) {
                    if (methodName) {
                        throw new Error(`Cannot find method '${className}::${methodName} in project'`)
                    } else {
                        throw new Error(`Cannot find class '${className}' in project`)
                    }
                }
            }
            // Check the current editor but don't fail
            else {
                resolvedScope = await this.proxy.getScopeForCursor(editor)

                if (!resolvedScope || !resolvedProject.containsPath(resolvedScope.getPath())) {
                    resolvedScope = null
                }
            }
        }

        if (null !== resolvedScope) {
            const classPath = resolvedScope.getPath()

            if (!resolvedProject.containsPath(classPath)) {
                throw new Error(`The path '${classPath}' for class (${className}) could not be found in project (${resolvedProject.getRoot()})`)
            }

            // null should indicate a path was explicitly not given
            if (null === path) {
                resolvedPath = classPath
            }
        }

        if (null === resolvedPath) {
            // Test if editor belongs to project, but don't fail
            if (editor) {
                resolvedPath = editor.getPath()

                if (!resolvedProject.containsPath(resolvedPath)) {
                    resolvedPath = null
                }
            }
            // resolvedPathFrom = 'TextEditor.'
        }
        // Path was given and needs validating
        else if (!resolvedProject.containsPath(resolvedPath)) {
            throw new Error(`Cannot find ${resolvedPathFrom}path '${resolvedPath}' in project (${resolvedProject.getRoot()})`)
        }

        return {
            project: resolvedProject,
            path: resolvedPath,
            scope: resolvedScope
        }
    }
}
