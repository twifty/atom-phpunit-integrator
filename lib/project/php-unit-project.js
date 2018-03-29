/** @babel */
/* global DOMParser Promise */

import {CompositeDisposable} from 'atom'
import Path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import {spawn} from 'child_process'
import escape from 'shell-escape'

import PhpUnitCoverageReport from '../reports/php-unit-coverage-report'
import PhpUnitTestReport from '../reports/php-unit-test-report'

/**
 * Creates and validates an xml document
 *
 * @param  {String}       data - Raw XML data
 *
 * @return {DOMDocument=}
 */
const createXmlDocument = (data) => {
  if (data) {
    const xmlDoc = (new DOMParser()).parseFromString(data, "text/xml")

    if (xmlDoc.getElementsByTagNameNS('http://www.w3.org/1999/xhtml', 'parsererror').length === 0) {
      return xmlDoc
    }
  }

  return null
}

/**
 * Reads an XML file into a DOMDocument
 *
 * @param  {String}               path - The full path of the XML file
 *
 * @return {Promise<DomDocument>}      - Resolves with a DOMDocument
 */
const readFile = (path) => {
  return new Promise((resolve, reject) => {
    fs.readFile(path, 'utf8', (err, data) => {
      const xmlDoc = err ? null : createXmlDocument(data)

      if (!xmlDoc) {
        return reject(new Error(`Failed to read "${path}"`))
      }

      resolve(xmlDoc)
    })
  })
}

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
    this.root = path
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
   * Returns the names of all testsuites found in the root phpunit.xml
   *
   * @return {Array<String>} - The test suite names
   */
  getTestSuiteNames () {
    let names = []

    if (this.cache.xmlDocument) {
      const iter = this.cache.xmlDocument.evaluate('/phpunit/testsuites/testsuite', this.cache.xmlDocument)

      let node = iter.iterateNext()
      while (node) {
        names.push(node.getAttribute('name'))
        node = iter.iterateNext()
      }
    }

    return names
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
    let args = [
      this.config.get('phpCommand'),
      this.config.get('phpUnitPath'),
      '--configuration',
      this.cache.xmlFilename,
      '--colors=always',
      '--log-junit',
      this.reportFile
    ]

    if (options.suite) {
      args = args.concat([
        '--testsuite',
        Array.isArray(options.suite) ? options.suite.join(',') : options.suite,
      ])
    }

    if (options.filter) {
      const filters = []

      for (const name in options.filter) {
        const methods = options.filter[name]

        let filter = name.replace(/\\/g, '\\\\')

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

    if (options.coverage) {
      args = args.concat([
      '--coverage-clover',
      this.coverageFile
      ])
    }

    return this.execute(args, options)
  }

  /**
   * Deletes all cache files from previous tests
   *
   * NOTE files specified within the phpunit.xml are not touched.
   *
   * @return {Promise}
   */
  clearAll () {
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
    })

    return Promise.all(promises)
  }

  /**
   * Reads the last test report
   *
   * @return {Promise<PhpUnitTestReport>}
   */
  readReportFile () {
    return readFile(this.reportFile).then((xmlDoc) => {
      return new PhpUnitTestReport(xmlDoc)
    })
  }

  /**
   * Reads the last code coverage report
   *
   * @return {Promise<PhpUnitCoverageReport>}
   */
  readCoverageFile () {
    return readFile(this.coverageFile).then((xmlDoc) => {
      return new PhpUnitCoverageReport(xmlDoc)
    })
  }

  /**
   * Reads the last log file report
   *
   * @return {Promise}
   */
  readLogFile () {
    return Promise.reject("Not yet implemented")
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
    return new Promise((resolve, reject) => {
      if (options.onCmdLine) {
        options.onCmdLine(`\x1b[33m[${this.root}]$\x1b[0m ${escape(command)}`)
      }

      const runtime = spawn(command[0], command.splice(1), {cwd: this.root})

      runtime.on('error', reject)

      runtime.on('close', (code) => {
        resolve(code)
      })

      if (options.onOutData) {
        runtime.stdout.on('data', (data) => {
          options.onOutData(data.toString())
        })
      }

      if (options.onErrData) {
        runtime.stderr.on('data', (data) => {
          options.onErrData(data.toString())
        })
      }
    })
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

    this.watcher = fs.watch(this.root, { encoding: 'utf8' }, () => {
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
      this.watcher.close()
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
    if (meta) {
      this.cache.lastCheck = meta.modified

      if (xmlDoc || meta.file !== this.cache.xmlFilename) {
        this.cache.xmlDocument = xmlDoc
        this.cache.xmlFilename = meta.file

        this.emitter.emit('project-config-changed', this)
      }
    } else if (this.lastCheck) {
      this.cache.lastCheck = 0

      if (this.cache.xmlDocument) {
        this.cache.xmlDocument = null
        this.cache.xmlFilename = null

        this.emitter.emit('project-config-changed', this)
      }
    } else {
      this.cache.lastCheck = 0
      this.cache.xmlDocument = null
      this.cache.xmlFilename = null
    }
  }
}
