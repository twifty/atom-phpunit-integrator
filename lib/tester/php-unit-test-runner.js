/** @babel */
/* global atom console */

import {Emitter} from 'atom'

import PhpUnitProjectManager from '../project/php-unit-project-manager'
import PhpUnitProject from '../project/php-unit-project'
import PhpUnitSkelgen from '../skelgen/php-skelgen-observer'
import PhpUnitProxy from '../proxy/php-unit-proxy'
import PhpUnitTestQueue from './php-unit-test-queue'
import CancelablePromise from '../util/cancelable-promise'

export default class PhpUnitTestRunner
{
	/**
	 * Constructor
	 *
	 * @constructor
	 * @param {PhpUnitConfig} config - The package configuration
	 */
	constructor (config) {
		this.config = config
		this.projectManager = new PhpUnitProjectManager(config)
		this.proxy = new PhpUnitProxy()
		this.skelgen = new PhpUnitSkelgen(this.proxy)
		this.emitter = new Emitter()
		this.coreService = null
	}

	/**
	 * Activates the proxy with database access
	 *
	 * @param  {PhpCoreService} coreService - The php-integrator-base wrapper
	 *
	 * @return {Promise}                    - Resolves when all have activated
	 */
	activate (coreService) {
		this.coreService = coreService

		return this.proxy.activate(coreService)
	}

	/**
	 * Destructor
	 */
	destroy () {
		this.projectManager.destroy()
		this.proxy.destroy()
		this.skelgen.destroy()
		this.emitter.dispose()
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
	 * Toggles the code coverage options of the tests
	 *
	 * @param  {PhpUnitProject} project - The project to configure
	 * @param  {Boolean}        toggle  - Flag to indicate on or off
	 *
	 * @return {Promise}                - Resolve when all listeners have resolved
	 */
	async enableCodeCoverage (project, toggle) {
		const resolved = await this.resolveOptions({project})

		toggle = !!toggle

		if (toggle !== resolved.project.isCodeCoverageEnabled()) {
			resolved.project.toggleCodeCoverage(toggle)

			return this.emitter.emitAsync('code-coverage-toggle', {
				project: resolved.project,
				enabled: resolved.project.isCodeCoverageEnabled()
			})
		}
	}

	/**
	 * Configures the default test suite to use for a project
	 *
	 * @param  {PhpUnitProject} project   - The project to configure
	 * @param  {String}         suiteName - The name of the test suite to use
	 *
	 * @return {Promise}                  - Resolve when all listeners have resolved
	 */
	async setSelectedTestSuiteNames (project, suiteNames) {
		const resolved = await this.resolveOptions({project})

		// if (suiteName !== resolved.project.getActiveTestSuiteName()) {
			resolved.project.setSelectedTestSuiteNames(suiteNames)

			return this.emitter.emitAsync('selected-test-suites-changed', {
				project: resolved.project,
				suiteNames
			})
		// }
	}

	/**
	 * Registers a listener for a change to the code coverage toggle
	 *
	 * The callback will be invoked with:
	 * 		@param {Object}         event
	 * 		@param {PhpUnitProject} event.project - The project being configured
	 * 		@param {Boolean}        event.enabled - The new state of the toggle
	 *
	 * @param  {Function} cb - The listeners callback
	 *
	 * @return {Disposable}
	 */
	onCodeCoverageToggled (cb) {
		return this.emitter.on('code-coverage-toggle', cb)
	}

	/**
	 * Registers a listener for a change to the active test suite
	 *
	 * The callback will be invoked with:
	 * 		@param {Object}         event
	 * 		@param {PhpUnitProject} event.project   - The project being configured
	 * 		@param {String}         event.suiteName - The new default suite name
	 *
	 * @param  {Function} cb - The listeners callback
	 *
	 * @return {Disposable}
	 */
	onSelectedTestSuitesChanged (cb) {
		return this.emitter.on('selected-test-suites-changed', cb)
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
			const suites = resolved.project.getTestSuiteNames()

			if (null === suiteNames) {
				suiteNames = resolved.project.getSelectedTestSuiteNames()
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

			const suites = resolved.project.getTestSuiteNames()

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
			let abortTest = false

			const options = {
				onWillCreate: () => abortTest = true
			}

			for (let scope of scopes) {
				if (!scope.isTestFile()) {
					scope = await this.skelgen.resolveTestSuite(scope, options)

					if (!scope) {
						console.log('No Test File Found!')
						return
					}
				}

				const className = scope.getFullClassName()

				filter[className] = []
			}

			if (!abortTest) {
				resolved.project.clear()

				await this.run(resolved.project, null, filter)
			}
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
		try {
			const resolved = await this.resolveOptions({project, path})

			await this.emitter.emitAsync('test-begin-batch', {
				project: resolved.project,
				// count: pending.length,
				queue
			})

			// TODO use a generator to prevent the delay in large projects
			const testFiles = await resolved.project.getTestClassPaths()
			const pending = []

			for (const path of testFiles) {
				const scopes = await this.proxy.getClassScopesForFile(path)
				const filter = {}

				for (let scope of scopes) {
					if (scope.isTestFile()) {
						const className = scope.getFullClassName()
						filter[className] = []
					}
				}

				if (0 !== Object.keys(filter).length) {
					pending.push(filter)
				}
			}

			if (0 === pending.length) {
				console.log('No Test Classes Found')
				return
			}

			resolved.project.clear()

			const queue = new PhpUnitTestQueue()

			for (const filter of pending) {
				const options = this.createTestOptions(resolved.project, filter)

				this.appendTest(queue, resolved.project, null, options)
			}

			await queue.execute().catch((error) => {
				if ('SIGKILL' !== error) {
					throw error
				}

				this.emitter.emit('tests-cancelled', {project: resolved.project})
			})

			await this.emitter.emitAsync('test-complete-batch', {
				project: resolved.project,
				queue
			})
		} catch (error) {
			console.error(error)
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
			let abortTest = false

			const resolved = await this.resolveOptions({project, className, scope})
			const filter = {}
			const options = {
				shouldOpen: this.config.get('gotoTest'),
				onWillCreate: () => abortTest = true
			}

			if (!resolved.scope) {
				console.log('No Source Class Found!')
				return
			}

			if (!resolved.scope.isTestFile()) {
				resolved.scope = await this.skelgen.resolveTestSuite(resolved.scope, options)
			}

			if (!resolved.scope) {
				console.log('No Test Class Found!')
				return
			}

			className = resolved.scope.getFullClassName()

			filter[className] = []

			if (!abortTest) {
				resolved.project.clear()

				await this.run(resolved.project, null, filter)
			}
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
			let abortTest = false
			const resolved = await this.resolveOptions({project, className, methodName, scope})
			const filter = {}
			const options = {
				shouldOpen: this.config.get('gotoTest'),
				onWillCreate: () => abortTest = true
			}

			if (!resolved.scope) {
				console.log('No Source Method Found!')
				return
			}

			if (!resolved.scope.isTestFile()) {
				resolved.scope = await this.skelgen.resolveTestCase(resolved.scope, options)
			}

			if (!resolved.scope) {
				console.log('No Test Method Found!')
				return
			}

			if (!resolved.scope.hasMethod()) {
				throw new Error(`A method is not present in the resolved scope.`)
			}

			className = resolved.scope.getFullClassName()
			methodName = resolved.scope.getMethodName()

			filter[className] = [
				methodName
			]

			if (!abortTest) {
				resolved.project.clear()

				await this.run(resolved.project, null, filter)
			}
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
				options = Object.assign({}, options, {suite})
				// options.suite = suite

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
			if ('SIGKILL' !== error) {
				throw error
			}

			this.emitter.emit('tests-cancelled', {project})
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
					resolvedScope = await this.proxy.getScopeForMethod(className, methodName)
				} else {
					resolvedScope = await this.proxy.getScopeForClass(className)
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
