/** @babel */
/** @jsx etch.dom */
/* global Promise atom document */

import etch from 'etch'
import {Emitter, CompositeDisposable} from 'atom'

import {EtchTreeView, EtchTreeNode} from 'colletch'
import {openInAtom} from '../util/php-unit-utils'

const icons = {
	passed: 'fa fa-passed php-test-passed',
	error: 'fa fa-error php-test-error',
	warning: 'fa fa-warning php-test-warning',
	failure: 'fa fa-failure php-test-failure',
	skipped: 'fa fa-skipped php-test-skipped'
}

const FILE_PATH_EXPRESSION = /^(.*?)(((?:\/|[A-Z]:\\)[\w\\/_-]+\.[\w.]+)(?:(?: on line |:)(\d+))?)(.*)$/g

function emptySpan () {
	return etch.dom(function() {
		this.element = document.createElement('div')
		this.element.innerHTML = "<span>&nbsp;</span>"
		this.update = () => {}
	})
}

/**
 * Handles the report tree view, run and filter buttons
 */
export default class PhpUnitReportView
{
	/**
	 * Constructor
	 *
	 * @constructor
	 * @param {Object} [options]                 - Creation options
	 * @param {Function} [options.onRunSuite]    - Called when the run all button is clicked
	 * @param {Function} [options.onRunSelected] - Called when the run selected button is clicked
	 * @param {Function} [options.onClearAll]    - Called when the clear button is clicked
	 */
	constructor (options) {
		this.emitter = new Emitter()
		this.listeners = new CompositeDisposable()
		this.filteredState = {}
		this.selectedCount = 0

		if (options) {
			if (options.onRunSuite) {
				this.emitter.on('run-suite', options.onRunSuite)
			}

			if (options.onRunSelection) {
				this.emitter.on('run-selected', options.onRunSelection)
			}

			if (options.onClearAll) {
				this.emitter.on('clear-all', options.onClearAll)
			}
		}

		etch.initialize(this)

		this.listeners.add(atom.commands.add(this.element, {
			'php-unit-integrator:report-goto-test': () => {
				const active = atom.contextMenu.activeElement

				if (active) {
					for (const name in this.refs) {
						if (name.startsWith('case-')) {
							const ref = this.refs[name].element

							if (active === ref || ref.contains(active)) {
								const file = ref.dataset.file
								const line = ref.dataset.line

								openInAtom(file, line)

								break
							}
						}
					}
				}
			}
		}))
	}

	/**
	 * Updates the view with a fresh report
	 *
	 * @param  {Object}            properties        - The test report details
	 * @param  {PhpUnitTestReport} properties.report - The report instance
	 *
	 * @return {Promise}                             - Resolves with nothing
	 */
	update (properties) {
		if (properties.report !== this.report) {
			this.report = properties.report
			this.suiteReports = this.report ? this.report.getTestSuiteReports() : null

			return etch.update(this)
		}

		if (properties.pendingReport) {
			this.pendingReport = true

			return etch.update(this)
		}

		return Promise.resolve()
	}

	/**
	 * Registers a function to call during the next refresh cycle
	 *
	 * @private
	 * @param  {Function} cb - The function to call
	 *
	 * @return {Promise}     - Resolves when the update completes
	 */
	scheduleUpdate (cb) {
		atom.views.updateDocument(cb)

		return atom.views.getNextUpdatePromise()
	}

	/**
	 * Builds a map of selected suites and methods
	 *
	 * @private
	 * @return {Object} - keys are suite classes, values are arrays of method names
	 */
	getCheckedItems () {
		const checked = {}

		this.refs.tree.getChildNodes().forEach(parentNode => {
			if (!parentNode.isDisabled()) {
				const childNodes = parentNode.getChildNodes()
				let checkedChildren = []

				for (const childNode of childNodes) {
					if (!childNode.isDisabled() && childNode.isSelected()) {
						checkedChildren.push(childNode.element.dataset.name)
					}
				}

				if (checkedChildren.length === childNodes.length) {
					checked[parentNode.element.dataset.name] = []
				} else if (0 < checkedChildren.length) {
					checked[parentNode.element.dataset.name] = checkedChildren
				}
			}
		})

		return checked
	}

	/**
	 * Click handler for the run-all, run-selected and clear-all buttons
	 *
	 * @private
	 * @param  {String} action - Indicates which button was clicked
	 */
	onClickButton (action) {
		switch (action) {
			case 'run-selected':
				this.emitter.emit(action, this.getCheckedItems())
				break

			case 'run-suite':
			case 'clear-all':
				this.emitter.emit(action)
		}
	}

	/**
	 * Toggles the state of nodes selected in the tree view
	 *
	 * This will synchronize the state of the parent with children nodes.
	 *
	 * @private
	 * @param  {EtchTreeNode} node - The node being toggled
	 */
	onSelectListItem (node) {
		const parentNode = node.getParentNode()
		const selected = node.isSelected()
		const modifier = selected ? 1 : -1

		if (parentNode instanceof EtchTreeView) {
			node.getChildNodes().forEach(child => {
				if (child.isSelected() !== selected) {
					this.selectedCount += modifier
					child.setSelected(selected)
				}
			})
		} else if (selected) {
			const childNodes = parentNode.getChildNodes()
			let selectedChildrenCount = 0

			for (let i = 0; i < childNodes.length; i++) {
				const child = childNodes[i]

				if (child.isSelected()) {
					selectedChildrenCount++
				} else {
					break
				}
			}

			if (selectedChildrenCount === childNodes.length) {
				parentNode.setSelected(true)
			}
			this.selectedCount++
		} else {
			parentNode.setSelected(false)
			this.selectedCount--
		}

		if (0 < this.selectedCount) {
			this.refs.runSelected.removeAttribute('disabled')
		} else {
			this.refs.runSelected.setAttribute('disabled', true)
		}
	}

	/**
	 * Click handler for the filter buttons
	 *
	 * @private
	 * @param  {String} state - Indicates which button was clicked
	 */
	onFilterList (state) {
		const turnOn = this.filteredState[state] === undefined
		const button = this.refs['btn-' + state]

		this.scheduleUpdate(() => {
			if (turnOn) {
				this.filteredState[state] = true

				button.classList.add('active')
			} else {
				delete this.filteredState[state]

				button.classList.remove('active')
			}

			const enableAll = Object.keys(this.filteredState).length === 0

			this.refs.tree.getChildNodes().forEach(treeNode => {
				const childNodes = treeNode.getChildNodes()
				let visibleNodes = childNodes.length

				childNodes.forEach(node => {
					if (enableAll || this.filteredState[node.element.dataset.state]) {
						node.setDisabled(false)
					} else {
						node.setDisabled(true)
						visibleNodes--
					}
				})

				if (visibleNodes === 0) {
					treeNode.setDisabled(true)
				} else {
					treeNode.setDisabled(false)
				}
			})
		})
	}

	/**
	 * Generates the virtual dom required to display errors
	 *
	 * @private
	 * @param  {Array<ErrorReport>} errors - The errors to render
	 *
	 * @return {Array<VirtualDom>}         - The rendered result
	 */
	createErrorItems (errors) {
		return errors.map(errorReport => {
			let message = errorReport.getMessage()
			let detail = errorReport.getDetail()

			const lines = []

			if (message) {
				lines.push(<div><span>{message}</span></div>)
				lines.push(emptySpan())
			}

			detail.split('\n').forEach(text => {
				if ('\n' === text) {
					lines.push(emptySpan())
				} else {
					const match = FILE_PATH_EXPRESSION.exec(text)

					if (match) {
						const props = {
							className: "file-link",
							onClick: openInAtom.bind(null, match[3], match[4])
						}

						lines.push(
							<div>
								<span>{ match[1] }</span>
								<span { ...props } >{ match[2] }</span>
								<span>{ match[5] }</span>
							</div>
						)
					} else {
						lines.push(<div><span>{text}</span></div>)
					}
				}
			})

			lines.pop()

			if (0 === lines.length) {
				return null
			}

			return (
				<li className="list-item">
					<div className="error-message">
						{ lines }
					</div>
				</li>
			)
		})
	}

	/**
	 * Generates a virtual DOM node for a test case/suite result
	 *
	 * @private
	 * @param  {BaseReport}        report     - The test results
	 * @param  {Array<VirtualDOM>} [children] - case node when creating a suite node
	 *
	 * @return {VirtualDOM}                   - The virtual DOM node
	 */
	createListItem (report, ref, children) {
		let state = report.getState()
		let className = ''
		let time = null

		const dataset = {
			state: state,
			name: report.getName()
		}

		if (report.isCaseReport() && report.getFilePath()) {
			dataset.file = report.getFilePath()
			dataset.line = report.getFileLine()

			className = 'has-navigation'
		}

		if ('passed' === state || report.isSuiteReport()) {
			time = <span className="test-time">{ report.getTime().toFixed(5) + 's' }</span>
		}

		const errors = this.createErrorItems(report.isCaseReport() ? report.getErrors() : [])

		const handleDoubleClick = () => {
			openInAtom(report.getFilePath(), report.getFileLine())
		}

		return (
			<EtchTreeNode
				ref={ ref }
				className={ className }
				dataset={ dataset }
				onDidSelect={ this.onSelectListItem.bind(this) }
				collapsed={ !!errors.length }
				icon={ icons[report.getState()] }
				onDoubleClick={ handleDoubleClick }
			>
				<span>
					<span>{report.getName()}</span>
					{ time }
				</span>
				{ errors }
				{ children || null }
			</EtchTreeNode>
		)
	}

	/**
	 * Generates the virtual DOM
	 *
	 * @private
	 * @return {VirtualDom}
	 */
	render () {
		const children = []
		const seenStates = []
		let filters = []
		let spinner = null

		if (this.suiteReports) {
			let cases = 0
			let suites = 0

			this.suiteReports.forEach(suiteReport => {
				const nodes = suiteReport.getCaseReports().map(caseReport => {
					const state = caseReport.getState()

					if (-1 === seenStates.indexOf(state)) {
						seenStates.push(state)
					}

					return this.createListItem(caseReport, 'case-' + ++cases)
				})

				children.push(this.createListItem(suiteReport, 'suite-' + ++suites, nodes))
			})
		}

		['passed', 'error', 'warning', 'failure', 'skipped'].forEach((state) => {
			if (0 <= seenStates.indexOf(state)) {
				filters.push(<li>
					<button
						ref={ 'btn-' + state }
						title={ 'Filter ' + state[0].toUpperCase() + state.substring(1) }
						onClick={ this.onFilterList.bind(this, state) }
						className={ 'icon fa-lg ' + icons[state] }
					/>
				</li>)
			}
		})

		if (filters.length <= 1) {
			filters = []
		} else {
			filters.unshift(<li><divider/></li>)
		}

		const isClearButtonDisabled = children.length ? {} : { disabled: true }
		const isRunButtonDisabled = this.selectedCount ? {} : { disabled: true }

		if (0 === children.length && this.pendingReport) {
			spinner = <div className="php-unit-report-loading"><spinner /></div>
		}

		return (
			<div className="php-unit-report-view">
				<ul className="php-unit-report-nav">
					<li>
						<button
							title="Run Suite"
							onClick={this.onClickButton.bind(this, 'run-suite')}
							className={'icon fa-lg fa fa-run-all'}
						/>
					</li>
					<li>
						<button { ...isRunButtonDisabled }
							title="Run Selected"
							ref="runSelected"
							onClick={this.onClickButton.bind(this, 'run-selected')}
							className={'icon fa-lg fa fa-run-select'}
						/>
					</li>
					<li>
						<button { ...isClearButtonDisabled }
							title="Clear All"
							onClick={this.onClickButton.bind(this, 'clear-all')}
							className={'icon fa-lg fa fa-clear-all'}
						/>
					</li>
					{filters}
				</ul>
				{ spinner }
				<EtchTreeView ref="tree" className="php-unit-report-tree">
					{children}
				</EtchTreeView>
			</div>
		)
	}
}
