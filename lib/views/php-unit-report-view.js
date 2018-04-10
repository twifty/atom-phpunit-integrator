/** @babel */
/** @jsx etch.dom */
/* global atom document Promise */

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

function createFilterStates (filters = []) {
	const states = {}

	if (filters.length === 0) {
		states.all = true
	} else {
		for (const state of filters) {
			states[state] = true
		}
	}

	return states
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
	 * @param {Function} [options.onDidSelect]   - Called when one or more tree items are selected
	 */
	constructor (options) {
		this.emitter = new Emitter()
		this.listeners = new CompositeDisposable()
		this.filters = createFilterStates(options.filterStates)
		this.selectedCount = 0

		this.selectHandler = options.onDidSelect || (() => {})
		this.clickHandler = options.onDidClick || (() => {})

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
		const tasks = []

		if (true === properties.pendingReport) {
			if (!this.pendingReport) {
				tasks.push(etch.update(this))
			}

			this.pendingReport = true
			this.report = null
		}
		else if (false === properties.pendingReport) {
			if (this.pendingReport) {
				tasks.push(etch.update(this))
			}

			this.pendingReport = false
		}

		if (undefined !== properties.report && properties.report !== this.report) {
			if (0 === tasks.length) {
				tasks.push(etch.update(this))
			}

			this.report = properties.report
		}

		if (this.report && !this.report.isValid()) {
			this.report = null
		}

		if (properties.filter) {
			this.filters = createFilterStates(properties.filter)

			tasks.push(this.updateFilters())
		}

		this.selectHandler(0)

		return Promise.all(tasks)
	}

	/**
	 * Resets the component to its initial empty state
	 *
	 * @return {Promise} - Resolves when rendering complete
	 */
	clear () {
		this.report = null
		this.filters = {}
		this.pendingReport = false

		return etch.update(this)
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
	 * Click handler for the filter buttons
	 *
	 * @private
	 */
	updateFilters () {
		return this.scheduleUpdate(() => {
			this.refs.tree.getChildNodes().forEach(treeNode => {
				const childNodes = treeNode.getChildNodes()
				let visibleNodes = childNodes.length

				childNodes.forEach(node => {
					if (this.filters.all || node.element.dataset.state in this.filters) {
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

		this.selectHandler(this.selectedCount)
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
	createListItem (report, children) {
		let state = report.getState()
		let className = ''
		let time = null
		let ref = null

		const attributes = {}
		const dataset = {
			state: state,
			name: report.getName()
		}

		if (report.isCaseReport()) {
			ref = 'suite-' + report.getUniqueId()
			if (report.getFilePath()) {
				dataset.file = report.getFilePath()
				dataset.line = report.getFileLine()
				dataset.suite = report.getSuiteName()

				className = 'has-navigation'
			}
			if (!this.filters.all && !(state in this.filters)) {
				attributes.disabled = true
			}
		} else {
			ref = 'case-' + report.getUniqueId()
			let count = 0
			for (const child of children) {
				if (child.props.disabled) {
					count++
				}
			}
			if (count === children.length) {
				attributes.disabled = true
			}
		}

		if ('passed' === state || report.isSuiteReport()) {
			time = <span className="test-time">{ report.getTime().toFixed(5) + 's' }</span>
		}

		const errors = this.createErrorItems(report.isCaseReport() ? report.getErrors() : [])

		const handleDoubleClick = () => {
			openInAtom(report.getFilePath(), report.getFileLine())
		}

		const handleSingleClick = (event) => {
			event.stopPropagation()

			if (ref !== this.selectedItem) {
				if (this.selectedItem) {
					this.refs[this.selectedItem].element.classList.remove('selected')
				}

				this.selectedItem = ref
				this.refs[ref].element.classList.add('selected')

				this.clickHandler(report)
			}
		}

		return (
			<EtchTreeNode
				{ ...attributes }
				ref={ ref }
				key={ report.getUniqueId() }
				className={ className }
				dataset={ dataset }
				onDidSelect={ this.onSelectListItem.bind(this) }
				collapsed={ !!errors.length }
				icon={ icons[report.getState()] }
				onClick={ handleSingleClick }
				onDoubleClick={ handleDoubleClick }
			>
				<span className="test-result">
					<span className="test-name">
						<div>{ report.getName() }</div>
					</span>
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
		let spinner = null

		if (this.report) {
			// console.log(this.report);
			for (const suiteReport of this.report.getTestSuiteReports()) {
				const nodes = suiteReport.getCaseReports().map(caseReport => {
					return this.createListItem(caseReport)
				})

				children.push(this.createListItem(suiteReport, nodes))
			}
		}

		if (0 === children.length && this.pendingReport) {
			spinner = <div className="php-unit-report-loading"><spinner /></div>
		}

		return (
			<div className="php-unit-report-view">
				{ spinner }
				<EtchTreeView ref="tree" className="php-unit-report-tree">
					{children}
				</EtchTreeView>
			</div>
		)
	}
}
