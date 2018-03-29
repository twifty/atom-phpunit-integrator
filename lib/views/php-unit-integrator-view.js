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

/**
 * Handles all views for the package
 */
export default class PhpUnitIntegratorView
{
  /**
   * Constructor
   *
   * @constructor
   * @param {PhpUnitProjectManager} projectManager - The open project collection
   * @param {PhpUnitConfig}         config         - Project configuration
   * @param {Array}                 [state]        - The previous result of @see {@link getState}
   */
  constructor (projectManager, config, state) {
    this.projectManager = projectManager
    this.configuration = config
    this.state = state

    this.disposables = new CompositeDisposable()
    this.coverageMarkers = new PhpUnitCoverageMarkers(this.projectManager)

    this.disposables.add(this.projectManager.onDidProjectsChange(projects => {
      this.buildProjectOptionList(projects)
      etch.update(this)
    }))

    this.disposables.add(this.projectManager.onDidProjectConfigChange(project => {
      if (project.root === this.selectedProject) {
        this.buildSuiteOptionList(project)
        etch.update(this)
      }
    }))

    this.buildProjectOptionList(this.projectManager.getProjects())

    etch.initialize(this)

    this.disposables.add(atom.commands.add('.php-unit-integrator .php-unit-output-view', {
      'core:copy': () => { this.refs.term.copySelection() },
      'php-unit-integrator:output-select-all' : () => { this.refs.term.selectAll() }
    }))
  }

  /**
   * Destructor
   */
  destroy () {
    this.disposables.dispose()
    this.coverageMarkers.destroy()

    this.disposables = null
    this.projectManager = null
    this.coverageMarkers = null

    etch.destroy(this)
  }

  /**
   * Returns the state of the views
   *
   * Currently this only returns the flex positions of the main container
   *
   * @return {Object} - A JSON encodable object
   */
  getState () {
    return {
      container: this.refs.container.getState()
    }
  }

  /**
   * Registers a URI which will open this view
   *
   * @return {String} - A unique URI
   */
  getURI () {
    return 'php-unit-integrator'
  }

  /**
   * Registers an icon to be used in the pane tab list
   *
   * @return {String} - An icon name
   */
  getIconName () {
    return 'terminal'
  }

  /**
   * Registers the title used in the pane tab list
   *
   * @return {String} - The title
   */
  getTitle () {
    return 'PHPUnit'
  }

  /**
   * Registers the default position within the panels
   *
   * @return {String} - The position
   */
  getDefaultLocation () {
    return 'bottom'
  }

  /**
   * Returns the DOM node to be inserted into the page
   *
   * @return {DomNode} - The element
   */
  getElement () {
    return this.element
  }

  /**
   * Required by etch
   *
   * @return {Promise} - Always resolves
   */
  update () {
    return Promise.resolve()
  }

  /**
   * Returns the state of the code coverage toggle
   *
   * @return {Boolean}
   */
  isCodeCoverageEnabled () {
    let enabled = false

    if (this.refs) {
      enabled = this.refs.codeCoverageToggle.checked
    }

    return enabled
  }

  /**
   * Returns the state of the current file toggle
   *
   * @return {Boolean}
   */
  isCurrentFileOnly () {
    let enabled = false

    if (this.refs) {
      enabled = this.refs.currentFileToggle.checked
    }

    return enabled
  }

  /**
   * Creates a list of selectable projects
   *
   * @private
   * @param  {Array<PhpUnitProject>} projects - The currently opened projects
   */
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

  /**
   * Creates a list of test suites available in the project
   *
   * @private
   * @param  {PhpUnitProject} project - The currently selected project
   */
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

  /**
   * Switches the suites according to the selected project
   *
   * @private
   */
  onSelectProject () {
    const path = this.refs.project.value
    const project = this.projectManager.getProject(path)

    this.selectedProject = project.root
    this.selectedSuite = null

    this.buildSuiteOptionList(project)
    etch.update(this)
  }

  /**
   * Click handler for the suite selection
   */
  onSelectSuite () {
    this.selectedSuite = this.refs.suite.value
  }

  /**
   * Click handler for the run suite button
   *
   * This also handles running selections
   *
   * @todo Should this be part of the view?
   * @todo Implement test groups
   *
   * @private
   * @param  {String}  [suite=this.selectedSuite] - The name of the suite to run
   * @param  {Object}  [filter={}]                - A map of suites and methods to filter by
   *
   * @return {Promise}                            - Resolves when test completed and results rendered
   */
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

  /**
   * Click handler for the run selected button
   *
   * @private
   * @param  {Object} selected - A map of suites and methods to filter by
   *
   * @return {Promise}         - Resolves when test completed and results rendered
   */
  runSelection (selected) {
    return this.runSuite(null, selected)
  }

  /**
   * Click handler for the clear all button
   *
   * @private
   * @return {Promise} - Resolves when rendering is complete
   */
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

  /**
   * Modifies lines in the terminal view to create clickable file links
   *
   * @private
   * @param  {Object}  event      - The pre render event
   * @param  {DomNode} event.line - The rendered line
   */
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

  /**
   * Generates the virtual DOM
   *
   * @private
   * @return {VirtualDom} - Required by etch
   */
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

        <EtchFlexContainer ref="container" state={ this.state && this.state.container } orientation="vertical">

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
