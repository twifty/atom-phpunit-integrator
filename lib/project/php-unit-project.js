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

const createXmlDocument = (data) => {
  if (data) {
    const xmlDoc = (new DOMParser()).parseFromString(data, "text/xml")

    if (xmlDoc.getElementsByTagNameNS('http://www.w3.org/1999/xhtml', 'parsererror').length === 0) {
      return xmlDoc
    }
  }

  return null
}

const readFile = (path) => {
  return new Promise((resolve, reject) => {
    // console.log('opening coverage file')
    fs.readFile(path, 'utf8', (err, data) => {
      const xmlDoc = err ? null : createXmlDocument(data)

      if (!xmlDoc) {
        return reject(new Error(`Failed to read "${path}"`))
      }

      // console.log(xmlDoc ? 'success' : 'failure')
      resolve(xmlDoc)
    })
  })
}

export default class PhpUnitProject
{
  constructor (path, options) {
    this.listeners = new CompositeDisposable()
    this.options = Object.assign({}, options)
    this.root = path
    this.name = Path.basename(path)
    this.emitter = this.options.emitter || {emit: () => {}}
    this.configBase = Path.join(path, 'phpunit.xml')

    this.phpPath = this.options.phpPath || 'php'
    this.phpUnitPath = this.options.phpUnitPath || './vendor/bin/phpunit'

    this.cache = {
      lastCheck: 0,
      xmlDocument: null,
      xmlFilename: null,
    }

    const hash = crypto.createHash('md5').update(this.name).digest('hex')
    const tmpDir = Path.join(os.tmpdir(), 'atom-php-unit', hash)

    this.reportFile = Path.join(tmpDir, 'report.xml')
    this.coverageFile = Path.join(tmpDir, 'coverage.xml')
    this.logFile = Path.join(tmpDir, 'log.xml')

    this.beginWatch()
  }

  destroy () {
    this.endWatch()
    this.listeners.dispose()
  }

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

  runTestSuite (name, options) {
    let args = [
      this.phpPath,
      this.phpUnitPath,
      '--configuration',
      this.cache.xmlFilename,
      '--testsuite',
      name,
      '--colors=always',
      '--log-junit',
      this.reportFile
    ]

    if (options.coverage) {
      args = args.concat([
      '--coverage-clover',
      this.coverageFile
      ])
    }

    return this.execute(args, options)
  }

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

  // Private methods

  execute (command, options) {
    return new Promise((resolve, reject) => {
      const hasRejected = false

      if (options.onCmdLine) {
        options.onCmdLine(`\x1b[33m[${this.root}]$\x1b[0m ${escape(command)}`)
      }

      const runtime = spawn(command[0], command.splice(1), {cwd: this.root})

      runtime.on('error', reject)

      runtime.on('exit', (code) => {
        if (code && !hasRejected) {
          reject(`The process failed with code (${code})`)
        }
      })

      runtime.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else if (!hasRejected) {
          reject(`The process failed with code (${code})`)
        }
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

  readReportFile () {
    return readFile(this.reportFile).then((xmlDoc) => {
      return new PhpUnitTestReport(xmlDoc)
    })
  }

  readCoverageFile () {
    return readFile(this.coverageFile).then((xmlDoc) => {
      return new PhpUnitCoverageReport(xmlDoc)
    })
  }

  readLogFile () {

  }

  beginWatch () {
    this.endWatch()
    this.readConfigFile()

    this.watcher = fs.watch(this.root, { encoding: 'utf8' }, () => {
      this.readConfigFile()
    })
  }

  endWatch () {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }

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
