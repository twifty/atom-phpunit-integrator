/** @babel */
/* global Promise */

import xpath from 'xpath'

export default class PhpUnitCoverageReport
{
  constructor (xmlDoc) {
    this.doc = xmlDoc
  }

  getCoverage () {
    if (!this.parser) {
      this.parser = new Promise((resolve, reject) => {
        if (!this.doc) {
          return reject(new Error('An XML document has not been configured!'))
        }

        const projectMetrics = xpath.select('/coverage/project/metrics', this.doc)
        const projectFiles = xpath.select('/coverage/project/file', this.doc)
        const projectPackages = xpath.select('/coverage/project/package', this.doc)

        if (projectMetrics.length !== 1) {
          return reject(new Error(`Expected one 'metrics' node exist, found ${projectMetrics.length}`))
        }

        const covered = parseInt(projectMetrics[0].getAttribute('coveredstatements'))
        const total = parseInt(projectMetrics[0].getAttribute('statements'))
        const percent = total ? Math.round((covered / total) * 100) : 0

        const meta = {
          covered,
          total,
          percent,
          files: this.parseFiles(projectFiles)
        }

        projectPackages.forEach(node => {
          const packageFiles = xpath.select('./file', node)

          Object.assign(meta.files, this.parseFiles(packageFiles))
        })

        resolve(meta)
      })
    }

    return this.parser
  }

  parseFiles (nodes) {
    const fileData = {}

    nodes.forEach(node => {
      const metrics = xpath.select('./metrics', node)
      // const lines = xpath.select("./line[@type='stmt']", node)
      const lines = xpath.select("./line", node)

      const path = node.getAttribute('name')
      const covered = parseInt(metrics[0].getAttribute('coveredstatements'))
      const total = parseInt(metrics[0].getAttribute('statements'))
      const percent = total ? Math.round((covered / total) * 100) : 0

      const lineCoverage = []

      lines.forEach(line => {
        const num = parseInt(line.getAttribute('num'))

        lineCoverage[num] = parseInt(line.getAttribute('count'))
      })

      fileData[path] = {
        path,
        covered,
        total,
        percent,
        lines: lineCoverage
      }
    })

    return fileData
  }
}
