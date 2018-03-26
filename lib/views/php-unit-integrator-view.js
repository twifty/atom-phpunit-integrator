/** @babel */
/** @jsx etch.dom */
/* global Promise atom console */

import etch from 'etch'
import { CompositeDisposable } from 'atom'

import {EtchFlexContainer, EtchFlexElement, EtchFlexSplitter, EtchTerminal} from '../etch/components'
import {openInAtom} from '../util/php-unit-utils'
import PhpUnitCoverageView from './php-unit-coverage-view'
import PhpUnitReportView from './php-unit-report-view'
import PhpUnitCoverageMarkers from '../markers/php-unit-coverage-markers'

const PHP_TRACE_EXPRESSION = /^PHP(?:[\s\d.]+)(?:\S+\s)([^:]+):(\d+)$/

export default class PhpUnitIntegratorView
{
  constructor (projectManager, options) {
    this.projectManager = projectManager
    this.options = options || {}

    this.disposables = new CompositeDisposable()
    this.coverageMarkers = new PhpUnitCoverageMarkers(this.projectManager)

    this.projectManager.onDidProjectsChange(projects => {
      this.buildProjectOptionList(projects)
      etch.update(this)
    })

    this.projectManager.onDidProjectConfigChange(project => {
      if (project.root === this.selectedProject) {
        this.buildSuiteOptionList(project)
        etch.update(this)
      }
    })

    this.buildProjectOptionList(this.projectManager.getProjects())

    etch.initialize(this)

    this.disposables.add(atom.commands.add('.php-unit-integrator .php-unit-output-view', {
      'core:copy': () => { console.log(this.refs.term.copySelection()) },
      'php-unit-integrator:output-select-all' : () => { this.refs.term.selectAll() }
    }))
  }

  destroy () {
    this.disposables.dispose()

    etch.destroy(this)
  }

  // dock/pane methods

  getURI () {
    return 'php-unit-integrator'
  }

  getIconName () {
    return 'terminal'
  }

  getTitle () {
    return 'PHPUnit'
  }

  getDefaultLocation () {
    return 'bottom'
  }

  getElement () {
    return this.element
  }

  update () {
    return Promise.resolve()
  }

  isCodeCoverageEnabled () {
    let enabled = false

    if (this.refs) {
      enabled = this.refs.codeCoverageToggle.checked
    }

    return enabled
  }

  isCurrentFileOnly () {
    let enabled = false

    if (this.refs) {
      enabled = this.refs.currentFileToggle.checked
    }

    return enabled
  }

  buildProjectOptionList (projects) {
    this.projectOptions = []
    this.suiteOptions = []

    projects.forEach(project => {
      const attributes = {}

      if (this.selectedProject == null || project.root === this.selectedProject) {
        attributes.selected = 'selected'
        this.selectedProject = project.root

        this.buildSuiteOptionList(project)
      }

      this.projectOptions.push((<option value={project.root} attributes={attributes}>{project.name}</option>))
    })
  }

  buildSuiteOptionList (project) {
    this.suiteOptions = []

    project.getTestSuiteNames().forEach(name => {
      const attributes = {}

      if (this.selectedSuite == null || name === this.selectedSuite) {
        attributes.selected = 'selected'
        this.selectedSuite = name
      }

      this.suiteOptions.push((<option value={name} attributes={attributes}>{name}</option>))
    })
  }

  onSelectProject () {
    const path = this.refs.project.value
    const project = this.projectManager.getProject(path)

    this.selectedProject = project.root
    this.selectedSuite = null

    this.buildSuiteOptionList(project)
    etch.update(this)
  }

  onSelectSuite () {
    this.selectedSuite = this.refs.suite.value
  }

  async runSuite (suite = this.selectedSuite, filter = {}) {
    const project = this.projectManager.getProject(this.selectedProject)
    const coverage = this.isCodeCoverageEnabled()
    const options = Object.assign({suite, filter}, {
      onCmdLine: (data) => {this.refs.term.clear(); this.refs.term.writeln(data + '\n')},
      onOutData: (data) => {this.refs.term.write(data)},
      onErrData: (data) => {this.refs.term.write(data)},
      coverage
    })

    try {
      await project.runTest(options)

      const testReport = await project.readReportFile()

      if (coverage) {
        const coverageReport = await project.readCoverageFile()

        await Promise.all([
          this.refs.report.update({report: testReport, root: project.root}),
          this.refs.coverage.update({report: coverageReport, root: project.root}),
          this.coverageMarkers.update({report: coverageReport, root: project.root})
        ])
      } else {
        await this.refs.report.update({report: testReport, root: project.root})
      }
    } catch (error) {
      console.error(error)
    }
  }

  runSelection (selected) {
    return this.runSuite(null, selected)
  }

  async clearAll () {
    const project = this.projectManager.getProject(this.selectedProject)

    try {
      await project.clearAll()

      await Promise.all([
        this.refs.report.update({root: project.root}),
        this.refs.coverage.update({root: project.root}),
        this.refs.term.clear()
      ])
    } catch (error) {
      console.error(error)
    }
  }

  onPreRenderOutputLine (event) {
    // PHP   3. PHPUnit\TextUI\Command->run() /home/owen/github/hello-world/vendor/phpunit/phpunit/src/TextUI/Command.php:141
    // PHP   8. count() /home/owen/github/hello-world/vendor/phpunit/php-code-coverage/src/Report/Html/Renderer/File.php:307

    const span = event.line.firstChild

    if (span) {
      const lineText = span.innerText
      const match = PHP_TRACE_EXPRESSION.exec(lineText)

      if (match) {
        // It's possible for matched path to be split across multiple spans, but
        // phpunit doesn't style these lines so we're safe. The single span needs
        // splitting into three.

        const leading = lineText.substring(0, lineText.indexOf(match[1]))
        const middle = match[1] + ':' + match[2]

        // NOTE Leaving this here just in case of future requirement
        // const trailing = lineText.substring((leading + middle).length)

        const applyText = (node, text) => {
          while (node.nodeType != 3) {
            node = node.firstChild
          }
          node.nodeValue = text
        }

        const copy = span.cloneNode(true)

        applyText(copy, leading)
        applyText(span, middle)

        span.classList.add('file-link')
        span.addEventListener('click', () => {
          openInAtom(match[1], parseInt(match[2]) - 1)
        })

        event.line.insertBefore(copy, span)
      }

    }
  }

  render () {
    let projectSelector = null

    if (1 < this.projectOptions.length) {
      projectSelector = (
        <label>
          <span>Project:</span>
          <select ref='project' className='form-control' onChange={this.onSelectProject.bind(this)}>
            { this.projectOptions }
          </select>
        </label>
      )
    }

    return (
      <div className="php-unit-integrator">
        <div className="php-unit-input-bar">

          { projectSelector }

          <label>
            <span>Suite:</span>
            <select ref='suite' className='form-control' onChange={this.onSelectSuite.bind(this)}>
              { this.suiteOptions }
            </select>
          </label>

          <label>
            <span>Code Coverage:</span>
            <input checked={false} ref="codeCoverageToggle" type="checkbox" className="input-toggle"/>
          </label>

          <label style={{display: 'none'}}>
            <span>Current File:</span>
            <input ref="currentFileToggle" type="checkbox" className="input-toggle"/>
          </label>
        </div>

        <EtchFlexContainer orientation="vertical">

          <EtchFlexElement flex={1}>
            <PhpUnitReportView
              onRunSuite={ this.runSuite.bind(this) }
              onRunSelection={ this.runSelection.bind(this) }
              onClearAll={ this.clearAll.bind(this) }
              ref="report"
            />
          </EtchFlexElement>

          <EtchFlexSplitter propagate={true} />

          <EtchFlexElement flex={2}>
            <EtchTerminal
              onPreRenderLine={ this.onPreRenderOutputLine.bind(this) }
              className="php-unit-output-view"
              ref="term"
            />
          </EtchFlexElement>

          <EtchFlexSplitter propagate={true}/>

          <EtchFlexElement flex={1}>
            <PhpUnitCoverageView ref="coverage" />
          </EtchFlexElement>

        </EtchFlexContainer>
      </div>
    )
  }
}
