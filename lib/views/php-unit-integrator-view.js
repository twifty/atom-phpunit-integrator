/** @babel */
/** @jsx etch.dom */
/* global Promise atom console */

import etch from 'etch'
import {CompositeDisposable} from 'atom'
import {EtchFlexContainer, EtchFlexElement, EtchFlexSplitter, EtchTerminal} from 'colletch'

import {openInAtom} from '../util/php-unit-utils'
import PhpUnitCoverageView from './php-unit-coverage-view'
import PhpUnitReportView from './php-unit-report-view'
// import PhpUnitCoverageMarkers from '../markers/php-unit-coverage-markers'

// const PHP_TRACE_EXPRESSION = /^PHP(?:[\s\d.]+)(?:\S+\s)([^:]+):(\d+)$/
const FILE_PATH_EXPRESSION = /^(.*?)(((?:\/|[A-Z]:\\)[\w\\/_-]+\.[\w.]+)(?:(?: on line |:)(\d+))?)(.*)$/g

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
	constructor (projectTester, config, state = {}) {
		this.projectTester = projectTester
		this.projectManager = projectTester.getProjectManager()
		this.configuration = config
		this.state = state
		this.orientation = state.orientation || "vertical"
		this.disposables = new CompositeDisposable()

		this.disposables.add(this.projectManager.onDidProjectsChange(projects => {
			this.buildProjectOptionList(projects)
			return Promise.all([
				this.clear(),
				etch.update(this)
			])
		}))

		this.disposables.add(this.projectManager.onDidProjectConfigChange(project => {
			if (project.getRoot() === this.selectedProject) {
				this.buildSuiteOptionList(project)
				return Promise.all([
					this.clear(),
					etch.update(this)
				])
			}
		}))

		this.buildProjectOptionList(this.projectManager.getProjects())

		etch.initialize(this)

		this.disposables.add(atom.commands.add('.php-unit-integrator .php-unit-output-view', {
			'core:copy': () => {
				this.refs.term.copySelection()
			},
			'php-unit-integrator:output-select-all': () => {
				this.refs.term.selectAll()
			}
		}))

		this.registerTestListeners()
	}

	/**
	 * Returns the current state of the instance as a JSON encodable object
	 *
	 * @return {Object} - The current state
	 */
	serialize () {
		// TODO: add default state in constructor
		return {
			deserializer: 'PhpUnitIntegratorView',
			container: this.refs.container.getState(),
			orientation: this.orientation,
		}
	}

	/**
	 * Required by etch
	 *
	 * @return {Promise} - Always resolves
	 */
	update (props) {
		let refresh = false

		if (props.activeProject && props.activeProject !== this.activeProject) {
			this.activeProject = props.activeProject
			refresh = true
		}

		if (props.orientation && props.orientation !== this.orientation) {
			this.orientation = props.orientation
			refresh = true
		}

		if (refresh) {
			return etch.update(this)
		}

		return Promise.resolve()
	}

	/**
	 * Destructor
	 */
	destroy () {
		if (this.disposables) {
			this.disposables.dispose()
		}
		// if (this.coverageMarkers) {
		// 	this.coverageMarkers.destroy()
		// }

		this.disposables = null
		this.projectTester = null
		this.projectManager = null
		// this.coverageMarkers = null

		etch.destroy(this)
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
	 * Attaches listeners to the main project tester
	 *
	 * @private
	 */
	registerTestListeners () {
		this.disposables.add(this.projectTester.onWillBeginBatchTest(({project}) => {
			this.runningBatch = true
			this.update({activeProject: project.getRoot()})
		}))

		this.disposables.add(this.projectTester.onDidCompleteBatchTest(({project}) => {
			this.runningBatch = false
			this.update({activeProject: project.getRoot()})
		}))

		this.disposables.add(this.projectTester.onDidBeginTest(async ({project}) => {
			if (!this.runningBatch) {
				await Promise.all([
					this.refs.report.update({}),
					this.refs.coverage.update({}),
					this.refs.term.clear(),
				])
			}

			if (project.getRoot() !== this.selectedProject) {
				this.selectedProject = project.getRoot()
				this.selectedSuite = null

				this.buildSuiteOptionList(project)
				etch.update(this)
			}

			this.update({activeProject: project.getRoot()})
		}))

		this.disposables.add(this.projectTester.onDidCompleteTest(async ({project}) => {
			const coverage = this.isCodeCoverageEnabled()
			const testReport = project.getTestReport()

			if (coverage) {
				const coverageReport = project.getCoverageReport()

				await Promise.all([
					this.refs.report.update({report: testReport}),
					this.refs.coverage.update({report: coverageReport}),
				])
			} else {
				await this.refs.report.update({report: testReport})
			}

			this.update({activeProject: project.getRoot()})
		}))

		this.disposables.add(this.projectTester.onTestCommandLine(({project, data}) => {
			this.update({activeProject: project.getRoot()})
			this.refs.term.clear();
			this.refs.term.writeln(data + '\n')
		}))

		this.disposables.add(this.projectTester.onTestOutputData(({project, data}) => {
			this.update({activeProject: project.getRoot()})
			this.refs.term.write(data)
		}))

		this.disposables.add(this.projectTester.onTestErrorData(({project, data}) => {
			this.update({activeProject: project.getRoot()})
			this.refs.term.write(data)
		}))
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

			if (this.selectedProject == null || project.getRoot() === this.selectedProject) {
				attributes.selected = 'selected'
				this.selectedProject = project.getRoot()

				this.buildSuiteOptionList(project)
			}

			this.projectOptions.push((<option value={project.getRoot()} attributes={attributes}>{project.name}</option>))
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

		// this.projectTester.setActiveTestSuite(project, this.selectedSuite)
	}

	/**
	 * Switches the suites according to the selected project
	 *
	 * @private
	 */
	onSelectProject () {
		const path = this.refs.project.value
		const project = this.projectManager.getProject(path)

		this.selectedProject = project.getRoot()
		this.selectedSuite = null

		this.buildSuiteOptionList(project)
		etch.update(this)
	}

	/**
	 * Click handler for the suite selection
	 */
	onSelectSuite () {
		// const path = this.refs.project.value
		const project = this.projectManager.getProject(this.selectedProject)

		this.selectedSuite = this.refs.suite.value

		this.projectTester.setActiveTestSuite(project, this.selectedSuite)
	}

	/**
	 * Code Coverage toggle handler.
	 *
	 * @return {Promise} - Resolves when all cleared
	 */
	onToggleCoverage () {
		// const path = this.refs.project.value
		const project = this.projectManager.getProject(this.selectedProject)
		const coverage = this.isCodeCoverageEnabled()

		this.projectTester.enableCodeCoverage(project, coverage)

		if (!coverage) {
			etch.getScheduler().updateDocument(() => {
				return this.refs.coverage.update()
			})
		}

		return Promise.resolve()
	}

	/**
	 * Click handler for the run selected button
	 *
	 * @private
	 * @param  {Object} selected - A map of suites and methods to filter by
	 *
	 * @return {Promise}         - Resolves when test completed and results rendered
	 */
	async runSuite (selected = null) {
		return this.projectTester.runTestSuite({
			project: this.selectedProject,
			filter: selected
		})
	}

	/**
	 * Click handler for the clear all button
	 *
	 * @private
	 * @return {Promise} - Resolves when rendering is complete
	 */
	async clear () {
		const project = this.projectManager.getProject(this.selectedProject)

		try {
			if (project) {
				await project.clear()
			}

			await Promise.all([
				this.refs.report.update({}),
				this.refs.coverage.update({}),
				this.refs.term.clear(),
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
		const span = event.line.firstChild

		if (span) {
			const lineText = span.innerText
			const match = FILE_PATH_EXPRESSION.exec(lineText)

			if (match) {
				const leading = match[1]
				const middle = match[2]
				const trailing = match[5]

				const applyText = (node, text) => {
					while (node.nodeType != 3) {
						node = node.firstChild
					}
					node.nodeValue = text
				}

				const copy = span.cloneNode(true)
				const link = span.cloneNode(true)

				applyText(copy, leading)
				applyText(link, middle)
				applyText(span, trailing)

				link.classList.add('file-link')
				link.addEventListener('click', () => {
					openInAtom(match[3], match[4])
				})

				event.line.insertBefore(copy, span)
				event.line.insertBefore(link, span)
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
			projectSelector = (<label>
				<span>Project:</span>
				<select ref='project' className='form-control' onChange={this.onSelectProject.bind(this)}>
					{this.projectOptions}
				</select>
			</label>)
		}

		return (<div className="php-unit-integrator">
			<div className="php-unit-input-bar">

				{projectSelector}

				<label>
					<span>Suite:</span>
					<select ref='suite' className='form-control' onChange={this.onSelectSuite.bind(this)}>
						{this.suiteOptions}
					</select>
				</label>

				<label>
					<span>Code Coverage:</span>
					<input checked={false} onClick={this.onToggleCoverage.bind(this)} ref="codeCoverageToggle" type="checkbox" className="input-toggle"/>
				</label>

				<label style={{ display: 'none' }}>
					<span>Current File:</span>
					<input ref="currentFileToggle" type="checkbox" className="input-toggle"/>
				</label>
			</div>

			<EtchFlexContainer ref="container" state={this.state && this.state.container} orientation={ this.orientation }>

				<EtchFlexElement flex={1}>
					<PhpUnitReportView onRunSuite={this.runSuite.bind(this)} onRunSelection={this.runSuite.bind(this)} onClearAll={this.clear.bind(this)} ref="report"/>
				</EtchFlexElement>

				<EtchFlexSplitter propagate={true}/>

				<EtchFlexElement flex={2}>
					<EtchTerminal onPreRenderLine={this.onPreRenderOutputLine.bind(this)} className="php-unit-output-view" ref="term"/>
				</EtchFlexElement>

				<EtchFlexSplitter propagate={true}/>

				<EtchFlexElement flex={1}>
					<PhpUnitCoverageView ref="coverage"/>
				</EtchFlexElement>

			</EtchFlexContainer>
		</div>)
	}
}
