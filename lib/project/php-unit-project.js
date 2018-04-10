/** @babel */
/* global atom Promise */

import {CompositeDisposable, Directory} from 'atom'
import Path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import {spawn} from 'child_process'
import escape from 'shell-escape'

import PhpUnitCoverageReport from '../reports/php-unit-coverage-report'
import PhpUnitTestReport from '../reports/php-unit-test-report'
import CancelablePromise from '../util/cancelable-promise'
import {removeLeadingChars, readXmlFile, createXmlDocument} from '../util/php-unit-utils'

const TEST_FILE_EXPRESSION = /Test\.php[t]?$/

/**
 * A conatiner for open project data
 */
export default class PhpUnitProject
{
	/**
	 * Initializes the instance
	 *
	 * @constructor
	 * @param {String}        path   - The path to the project root
	 * @param {PhpUnitConfig} config - The project configurations
	 */
	constructor (path, config) {
		this.listeners = new CompositeDisposable()
		this.config =config
		this.directory = new Directory(path)
		this.name = Path.basename(path)

		this.emitter = this.config.get('project-emitter')

		this.cache = {
			lastCheck: 0,
			xmlDocument: null,
			xmlFilename: null,
		}

		const hash = crypto.createHash('md5').update(this.name).digest('hex')
		const tmpDir = Path.join(os.tmpdir(), 'atom-php-unit', hash)

		this.configBase = Path.join(path, 'phpunit.xml')
		this.reportFile = Path.join(tmpDir, 'report.xml')
		this.coverageFile = Path.join(tmpDir, 'coverage.xml')
		this.logFile = Path.join(tmpDir, 'log.xml')

		this.testReport = null
		this.coverageReport = null

		this.codeCoverageEnabled = false
		this.selectedSuiteNames = []
		this.selectedGroupNames = []

		this.beginWatch()
	}

	/**
	 * Destroys the instance
	 */
	destroy () {
		this.endWatch()
		this.listeners.dispose()
	}

	/**
	 * Returns the root directory of the project
	 *
	 * @return {String}
	 */
	getRoot () {
		return this.directory.getPath()
	}

	/**
	 * Checks if the given path is a subdirectory of the project
	 *
	 * @param  {String} path - The path to check
	 *
	 * @return {Boolean}
	 */
	containsPath (path) {
		return this.directory.contains(path)
	}

	/**
	 * Checks if the editor is for a PHP file
	 *
	 * @private
	 * @param  {TextEditor} editor - The open editor
	 *
	 * @return {Boolean}
	 */
	isEditorOfInterest (editor) {
		if (editor) {
			const path = editor.getPath()
			const grammar = editor.getGrammar()

			if (grammar && grammar.scopeName === 'text.html.php') {
				if (path && this.containsPath(path)) {
					return true
				}
			}
		}

		return false
	}

	/**
	 * Returns the names of all testsuites found in the root phpunit.xml
	 *
	 * @return {Array<String>} - The test suite names
	 */
	getAvailableSuiteNames () {
		let names = []

		if (this.cache.xmlDocument) {
			const iter = this.cache.xmlDocument.evaluate('/phpunit/testsuites/testsuite', this.cache.xmlDocument)

			let node = iter.iterateNext()
			while (node) {
				const suiteName = node.getAttribute('name')

				if (null === this.activeTestSuite) {
					this.activeTestSuite = suiteName
				}

				names.push(suiteName)
				node = iter.iterateNext()
			}
		}

		return names
	}

	/**
	 * Configures the active test suite names
	 *
	 * @param {String|Array<String>} suiteNames - A valid suite name
	 */
	setSelectedSuiteNames (suiteNames) {
		const names = this.getAvailableSuiteNames()

		if (!Array.isArray(suiteNames)) {
			suiteNames = [suiteNames]
		}

		for (const suiteName of suiteNames) {
			if (-1 === names.indexOf(suiteName)) {
				throw new Error(`The test suite '${suiteName}' is not part of this project (${this.getRoot()})`)
			}
		}

		this.selectedSuiteNames = suiteNames.slice(0)
	}

	/**
	 * Returns the active suite name
	 *
	 * @return {Array<String>}
	 */
	getSelectedSuiteNames () {
		return this.selectedSuiteNames.slice(0)
	}

	/**
	 * Returns the names of the test groups available in the test suites
	 *
	 * @return {Array<String>} [description]
	 */
	getAvailableGroupNames () {
		if (this.cache.groups) {
			return this.cache.groups.slice(0)
		}

		return []
	}

	/**
	 * Caches the selected group names
	 *
	 * @param {Array<String>} groupNames - The selected group names
	 */
	setSelectedGroupNames (groupNames) {
		const groups = this.getAvailableGroupNames()

		if (!Array.isArray(groupNames)) {
			groupNames = [groupNames]
		}

		for (const groupName of groupNames) {
			if (-1 === groups.indexOf(groupName)) {
				throw new Error(`The test group '${groupName}' is not part of this project (${this.getRoot()})`)
			}
		}

		this.selectedGroupNames = groupNames
	}

	/**
	 * Retrieves the previously configured selected group names
	 *
	 * @return {Array<String>} - The group names
	 */
	getSelectedGroupNames () {
		return this.selectedGroupNames.slice(0)
	}

	/**
	 * Enables/Disables the generation of code coverage during tests
	 *
	 * @param  {Boolean} toggle - An on/off flag
	 */
	toggleCodeCoverage (toggle) {
		this.codeCoverageEnabled = !!toggle
	}

	/**
	 * Checks if code coverage will be generated during tests
	 *
	 * @return {Boolean}
	 */
	isCodeCoverageEnabled () {
		return this.codeCoverageEnabled
	}

	/**
	 * Returns the test report
	 *
	 * If @see {@link clear} wasn't called between running tests, the returned
	 * report will be a merged with older reports.
	 *
	 * @return {PhpUnitTestReport} - The test report
	 */
	getTestReport () {
		return this.testReport
	}

	/**
	 * Returns the coverage report
	 *
	 * If @see {@link clear} wasn't called between running tests, the returned
	 * report will be a merged with older reports.
	 *
	 * @return {PhpUnitCoverageReport} - The coverage report
	 */
	getCoverageReport () {
		return this.coverageReport
	}

	/**
	 * Returns all file paths in the test directory.
	 *
	 * @param  {String}   [dir=null]    - Sub directory to begin the search
	 * @param  {Function} [filter=null] - Passed an instance of File, must return true to exclude
	 *
	 * @return {Promise<Array<String>>} - Resolves with the file list
	 */
	async getTestClassPaths (dir = null, filter = null) {
		const testDirs = ['test', 'tests', 'Test', 'Tests']

		if (typeof dir === 'function') {
			filter = dir
			dir = null
		} else if (typeof dir === 'string') {
			dir = new Directory(dir)
		}

		let initial

		if (null == dir) {
			initial = await new Promise((resolve, reject) => {
				this.directory.getEntries((error, entries) => {
					if (error) {
						return reject(error)
					}

					const found = []

					for (const entry of entries) {
						const name = entry.getBaseName()

						if (entry.isDirectory() && -1 !== testDirs.indexOf(name)) {
							found.push(entry)
						}
					}

					resolve(found)
				})
			})
		}
		else if (!(dir instanceof Directory)) {
			throw new Error('Expected a path or a Directory instance')
		}
		else if (!this.containsPath(dir.getPath())) {
			throw new Error(`The directory '${dir.getPath()}' is not part of the project (${this.getRoot()})`)
		}
		else {
			initial = [dir]
		}

		const paths = []

		if (!filter) {
			filter = (file) => !TEST_FILE_EXPRESSION.test(file.getPath())
		}

		function traverse (dir) {
			return new Promise((resolve, reject) => {
				dir.getEntries((error, entries) => {
					if (error) {
						reject(error)
					}

					const subDirs = []

					for (const entry of entries) {
						if (entry.isDirectory()) {
							subDirs.push(traverse(entry))
						} else if (!filter(entry)) {
							paths.push(entry.getPath())
						}
					}

					Promise
						.all(subDirs)
						.then(resolve)
						.catch(reject)
				})
			})
		}

		for (const dir of initial) {
			await traverse(dir)
		}

		return paths
	}

	/**
	 * Spawns a phpunit process running a named test suite
	 *
	 * @param  {Object}   [options]           - Options
	 * @param  {String}   [options.suite]     - The name of the test suite to run
	 * @param  {Boolean}  [options.coverage]  - Flag to indicate if code coverage is required
	 * @param  {Object}   [options.filter]    - A map of class name to array of methods
	 * @param  {function} [options.onCmdLine] - A function to stream the formatted command
	 * @param  {function} [options.onOutData] - A function to stream stdout data
	 * @param  {function} [options.onErrData] - A function to stream stderr data
	 *
	 * @return {Promise}                      - Resolves with the process' exit code
	 */
	runTest (options = {}) {
		options = Object.assign({
			suite: this.activeTestSuite,
		}, options)

		let args = [
			this.config.get('phpCommand'),
			this.config.get('phpUnitPath'),
			'--configuration',
			this.cache.xmlFilename,
			'--colors',
			'--log-junit',
			this.reportFile,
		]

		const configParameters = this.config.get('additionalCommandParameters')

		if (configParameters) {
			args = args.concat(configParameters.split(' '))
		}

		if (options.suite) {
			args = args.concat([
				'--testsuite',
				Array.isArray(options.suite) ? options.suite.join(',') : options.suite,
			])
		}

		if (this.selectedGroupNames.length) {
			args = args.concat([
				'--group',
				this.selectedGroupNames.join(',')
			])
		}

		if (options.filter && 0 !== Object.keys(options.filter).length) {
			const filters = []

			for (const name in options.filter) {
				const methods = options.filter[name]

				let filter = removeLeadingChars('\\', name).replace(/\\/g, '\\\\')

				if (methods.length === 1) {
					filter += '::' + methods[0]
				} else if (methods.length !== 0) {
					filter += '::(?:' + methods.join('|') + ')'
				}

				filters.push(filter)
			}

			args = args.concat([
				'--filter',
				'/' + filters.join('|') + '/'
			])
		}

		if (this.codeCoverageEnabled) {
			args = args.concat([
				'--coverage-clover',
				this.coverageFile
			])
		}

		return this.execute(args, options).then((result) => {
			if (options.codeCoverageEnabled) {
				return Promise.all([
					this.readTestReportFile(result),
					this.readCoverageReportFile(result)
				])
			} else {
				return this.readTestReportFile(result)
			}
		}).catch((error) => {
			atom.notifications.addError('Failed to execute phpunit', {
				detail: error.message + '\n\n' + error.data,
				dismissable: true
			})

			throw 'Failure'
		})
	}

	/**
	 * Deletes all cache files from previous tests
	 *
	 * NOTE files specified within the phpunit.xml are not touched.
	 *
	 * @return {Promise}
	 */
	async clear () {
		const promises = [];

		[this.reportFile, this.coverageFile, this.logFile].forEach(file => {
			promises.push(
				new Promise((resolve, reject) => {
					fs.unlink(file, (err) => {
						if (err && err.code !== 'ENOENT') {
							return reject(err)
						}

						resolve()
					})
				})
			)
		});

		['testReport', 'coverageReport'].forEach(property => {
			if (this[property]) {
				this[property].destroy()
				this[property] = null
			}
		})

		return Promise.all(promises)
	}

	/**
	 * Reads the last test report
	 *
	 * @private
	 * @param  {Object} result - The raw process' output data
	 *
	 * @return {Promise<PhpUnitTestReport>}
	 */
	async readTestReportFile (result) {
		try {
			const xmlDoc = await readXmlFile(this.reportFile)
			const report = new PhpUnitTestReport(this, xmlDoc, result)

			if (this.testReport) {
				this.testReport = report.merge(this.testReport)
			} else {
				this.testReport = report
			}
		} catch (error) {
			error.data = result.data

			throw error
		}
	}

	/**
	 * Reads the last code coverage report
	 *
	 * @private
	 * @param  {Object} result - The raw process' output data
	 *
	 * @return {Promise<PhpUnitCoverageReport>}
	 */
	async readCoverageReportFile (result) {
		try {
			const xmlDoc = await readXmlFile(this.coverageFile)
			const report = new PhpUnitCoverageReport(this, xmlDoc)

			if (this.coverageReport) {
				this.coverageReport = report.merge(this.coverageReport)
			} else {
				this.coverageReport = report
			}
		} catch (error) {
			error.data = result.data

			throw error
		}
	}

	/**
	 * Spawns the process
	 *
	 * @private
	 * @param  {Array<String>} command - All args
	 * @param  {Object}         options - @see {@link runTestSuite}
	 *
	 * @return {Promise}
	 */
	execute (command, options) {
		let spawnedProcess = null

		const onExecute = (resolve, reject) => {
			const path = this.directory.getPath()
			const escaped = escape(command)

			const result = {
				cmdLine: escaped,
				cmd: `\x1b[33m[${path}]$\x1b[0m ${escaped}`,
				data: '',
			}

			if (options.onCmdLine) {
				options.onCmdLine(result.cmd)
			}

			spawnedProcess = spawn(command[0], command.splice(1), {cwd: path})

			spawnedProcess.on('error', reject)

			spawnedProcess.on('close', (code, signal) => {
				spawnedProcess = null

				if (signal) {
					return reject(signal)
				}

				result.code = code

				resolve(result)
			})

			if (options.onOutData) {
				spawnedProcess.stdout.on('data', (data) => {
					result.data += data
					options.onOutData(data.toString())
				})
			}

			if (options.onErrData) {
				spawnedProcess.stderr.on('data', (data) => {
					options.onErrData(data.toString())
				})
			}
		}

		const onCancel = () => {
			if (spawnedProcess) {
				spawnedProcess.kill('SIGKILL')
			}
		}

		return new CancelablePromise(onExecute, onCancel)
	}

	/**
	 * Searches the root dir for phpunit.xml and phpunit.xml.dist (in that order)
	 *
	 * @private
	 * @return {Promise}
	 */
	findConfigFile () {
		let file = this.configBase
		let promises = []

		for (let i = 0; i < 2; i++) {
			promises.push(new Promise(resolve => {
				(file => {
					fs.stat(file, (err, stats) => {
						const result = err ? null : {
							file,
							modified: stats.mtime.getTime()
						}

						resolve(result)
					})
				})(file)
			}))

			file += '.dist'
		}

		return Promise.all(promises).then(results => {
			for (let i = 0; i < 2; i++) {
				if (results[i]) {
					return results[i]
				}
			}
		})
	}

	/**
	 * Reads the list of groups specified by the phpunit binary
	 *
	 * NOTE It's not currently possible to watch the groups
	 *
	 * @return {Promise<Array<String>>} - Resolves with the groups names
	 */
	readGroupList () {
		let stdOut = ''

		const options = {
			onOutData: (data) => {
				stdOut += data
			},
		}
		const args = [
			this.config.get('phpCommand'),
			this.config.get('phpUnitPath'),
			'--list-groups',
		]

		if (this.cache.xmlFilename) {
			args.push('--configuration')
			args.push(this.cache.xmlFilename)
		}

		return this.execute(args, options).then(() => {
			const groups = []

			stdOut.split('\n').forEach(line => {
				if (line.startsWith(' - ')) {
					groups.push(line.substring(3))
				}
			})

			return groups
		})
	}

	/**
	 * Attempts to read phpunit.xml file
	 *
	 * Will emit a 'project-config-changed' when done.
	 *
	 * @private
	 * @return {Promise}
	 */
	readConfigFile () {
		return this.findConfigFile().then(meta => {
			if (!meta) {
				return this.onChange()
			}

			if (meta.modified !== this.cache.lastCheck || meta.file !== this.cache.xmlFilename) {
				// file has been modified/created
				fs.readFile(meta.file, 'utf8', (err, data) => {
					const xmlDoc = err ? null : createXmlDocument(data)

					// failure to parse should preserve the previous cache
					this.onChange(meta, xmlDoc)
				})
			}
		})
	}

	/**
	 * Watches the root directory for file changes
	 *
	 * This is required in the event the user adds/removes a phpunit.xml(.dist)
	 *
	 * @private
	 */
	beginWatch () {
		this.endWatch()
		this.readConfigFile()

		this.watcher = this.directory.onDidChange(() => {
			this.readConfigFile()
		})
	}

	/**
	 * Stops watching the root directory for file changes
	 *
	 * @private
	 */
	endWatch () {
		if (this.watcher) {
			this.watcher.dispose()
			this.watcher = null
		}
	}

	/**
	 * Handler for any changes to the phpunit.xml file
	 *
	 * @private
	 * @param  {Object}      [meta]        - Information about the change
	 * @param  {Number}      meta.modified - The time of the change
	 * @param  {String}      meta.file     - Points to either .xml or .xml.dist
	 * @param  {DomDocument} [xmlDoc]      - The parsed document
	 */
	onChange (meta, xmlDoc) {
		const handleChange = () => {
			this.readGroupList().then((groups) => {
				this.cache.groups = groups

				this.emitter.emit('project-config-changed', this)
			})
		}

		if (meta) {
			this.cache.lastCheck = meta.modified

			if (xmlDoc || meta.file !== this.cache.xmlFilename) {
				this.cache.xmlDocument = xmlDoc
				this.cache.xmlFilename = meta.file

				handleChange()
			}
		} else if (this.lastCheck) {
			this.cache.lastCheck = 0

			if (this.cache.xmlDocument) {
				this.cache.xmlDocument = null
				this.cache.xmlFilename = null

				handleChange()
			}
		} else {
			this.cache.lastCheck = 0
			this.cache.xmlDocument = null
			this.cache.xmlFilename = null
			this.cache.groups = null
		}
	}
}
