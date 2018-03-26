/** @babel */
/* global Promise */

import xpath from 'xpath'

const STATES = {
  'passed': 0,
  'skipped': 1,
  'failure': 2,
  'warning': 3,
  'error': 4
}

const STATE_HIERARCHY = {
  0: 'passed',
  1: 'skipped',
  2: 'failure',
  3: 'warning',
  4: 'error'
}

const maxState = (l, r) => {
  return STATE_HIERARCHY[
    Math.max( STATES[l], STATES[r] )
  ]
}

export default class PhpUnitTestReport
{
  constructor (xmlDoc) {
    this.doc = xmlDoc
  }

  getTestCases () {
    if (!this.parser) {
      this.parser = new Promise((resolve, reject) => {
        if (!this.doc) {
          return reject(new Error('An XML document has not been configured!'))
        }

        const suites = xpath.select('/testsuites/testsuite', this.doc)
        let meta = []

        suites.forEach(suite => {
          meta = meta.concat(this.parseTestSuite(suite))
        })

        resolve(meta)
      })
    }

    return this.parser
  }

  getTestSuites () {
    return this.getTestCases().then(testCases => {
      const testSuites = {}

      testCases.forEach(testCase => {
        const suiteName = testCase.class || '<standalone>'
        const suiteData = testSuites[suiteName] || {
          name: suiteName,
          state: 'passed',
          time: 0,
          cases: []
        }

        suiteData.time += testCase.time
        suiteData.state = maxState(testCase.state, suiteData.state)
        suiteData.cases.push(testCase)

        testSuites[suiteName] = suiteData
      })

      return Object.values(testSuites)
    })
  }

  parseTestCase (node) {
    let meta = {
      state: 'passed',

      // The name of the test case method
      name: node.getAttribute('name'),
      time: parseFloat(node.getAttribute('time')),

      // The following are only available if a genuine test case was used

      // The fully qualified class name
      class: node.getAttribute('class'),
      // The full path to the source
      file: node.getAttribute('file'),
      // The line on which the test case was declared
      line: parseInt(node.getAttribute('line')),
      // The number of assert statements in the test
      assertions: parseInt(node.getAttribute('assertions')),

      output: ''
    }

    const output = xpath.select('./system-out', node)
    if (output.length > 0) {
      meta.output = output[0].textContent
    }

    ['error', 'warning', 'failure', 'skipped'].some(name => {
      const n = xpath.select('./' + name, node)

      if (n.length > 0) {
        meta.state = name
        meta[name] = {
          type: n[0].getAttribute('type'),
          data: n[0].textContent
        }

        return true
      }
    })

    return meta
  }

  parseTestSuite (suite) {
    let meta = []

    const suites = xpath.select('./testsuite', suite)
    const cases = xpath.select('./testcase', suite)

    suites.forEach(s => {
      meta = meta.concat(this.parseTestSuite(s))
    })

    cases.forEach(c => {
      meta.push(this.parseTestCase(c))
    })

    return meta
  }
}
