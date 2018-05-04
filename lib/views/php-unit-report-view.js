/** @babel */
/** @jsx etch.dom */
/* global atom window document Promise */

import etch from 'etch'
import {Emitter, CompositeDisposable} from 'atom'

import {EtchTreeView, EtchTreeNode} from 'colletch'
import {openInAtom} from '../util/php-unit-utils'
import {compareStates} from '../reports/states'

const icons = {
    passed:  'php-test-passed  icon icon-check',
    error:   'php-test-error   icon icon-circle-slash',
    warning: 'php-test-warning icon icon-alert',
    failure: 'php-test-failure icon icon-alert',
    skipped: 'php-test-skipped icon icon-issue-opened',
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
        this.disposables = new CompositeDisposable()
        this.filters = createFilterStates(options.filterStates)
        this.selectedCount = 0
        this.packageConfig = options.packageConfig
        this.maxErrorLines = this.packageConfig.get('error-lines')

        this.selectHandler = options.onDidSelect || (() => {})
        this.clickHandler = options.onDidClick || (() => {})

        etch.initialize(this)

        let contextMenuEvent = null

        const navigate = (name) => {
            let element = contextMenuEvent && contextMenuEvent.target

            while (element && !element.classList.contains(name)) {
                element = element.parentElement
            }

            if (element) {
                openInAtom(element.dataset.file, element.dataset.line || 0, true)
            }
        }

        this.disposables.add(atom.commands.add(this.element, {
            'php-unit-integrator:report-goto-test-case': navigate.bind(null, 'test-case'),
            'php-unit-integrator:report-goto-test-class': navigate.bind(null, 'test-class'),
            'php-unit-integrator:report-collapse-all': this.updateExpansion.bind(this, false),
            'php-unit-integrator:report-expand-all': this.updateExpansion.bind(this, true),
            'php-unit-integrator:report-select-all': () => {
                this.selectAll(contextMenuEvent.target)
            },
        }))

        this.disposables.add(this.packageConfig.onDidChange(({name, value}) => {
            if ('error-lines' === name) {
                this.maxErrorLines = value

                etch.update(this)
            }
        }))

        this.disposables.add(atom.contextMenu.add({
            ".php-unit-integrator .php-unit-report-view .error-message": [
                {
                    label: "Copy",
                    command: "core:copy",
                    shouldDisplay: () => {
                        return !!this.getSelection()
                    }
                }, {
                    label: "Select All",
                    command: "php-unit-integrator:report-select-all",
                    created: (event) => {
                        contextMenuEvent = event
                    }
                }
            ],
            ".php-unit-integrator .php-unit-report-tree.has-collapsable-children": [
                {
                    label: "Collapse All",
                    command: "php-unit-integrator:report-collapse-all",
                }, {
                    label: "Expand All",
                    command: "php-unit-integrator:report-expand-all",
                },
            ],
            ".php-unit-integrator .php-unit-report-view .test-case": [
                {
                    label: "Go to TestCase",
                    command: "php-unit-integrator:report-goto-test-case",
                    created: (event) => {
                        contextMenuEvent = event
                    }
                }
            ],
            ".php-unit-integrator .php-unit-report-view .test-class": [
                {
                    label: "Go to TestClass",
                    command: "php-unit-integrator:report-goto-test-class",
                    created: (event) => {
                        contextMenuEvent = event
                    }
                }
            ]
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

        if (properties.expandAll) {
            tasks.push(this.updateExpansion(true))
        } else if (properties.collapseAll) {
            tasks.push(this.updateExpansion(false))
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
     * Sorts the list items in the tree
     *
     * @private
     * @param  {String} which - One of 'state', 'name' or 'time'
     * @param  {String} dir   - One of 'asc' or 'desc'
     *
     * @return {Promise}     - Resolves when rendered
     */
    sort (which, dir) {
        let comparator

        switch (which) {
            case 'name':
                if (dir === 'asc') {
                    comparator = (a, b) => {
                        return a.dataset.name.localeCompare(b.dataset.name)
                    }
                } else {
                    comparator = (a, b) => {
                        return b.dataset.name.localeCompare(a.dataset.name)
                    }
                }
                break
            case 'time':
                if (dir === 'asc') {
                    comparator = (a, b) => {
                        return a.dataset.time - b.dataset.time
                    }
                } else {
                    comparator = (a, b) => {
                        return b.dataset.time - a.dataset.time
                    }
                }
                break
            case 'state':
                if (dir === 'asc') {
                    comparator = (a, b) => {
                        return -compareStates(a.dataset.state, b.dataset.state)
                    }
                } else {
                    comparator = (a, b) => {
                        return compareStates(a.dataset.state, b.dataset.state)
                    }
                }
                break
        }

        const sortList = (list) => {
            if (1 === list.childNodes.length) {
                return
            }

            const sorted = [...list.childNodes].sort(comparator)

            for (const item of sorted) {
                list.appendChild(item)
            }
        }

        return this.scheduleUpdate(() => {
            for (const child of this.refs.tree.element.childNodes) {
                sortList(child.childNodes[1])
            }

            sortList(this.refs.tree.element)
        })
    }

    /**
     * Returns the currently selected error text
     *
     * @return {String}
     */
    getSelection () {
        const selection = window.getSelection()

        if (this.element.contains(selection.anchorNode) && this.element.contains(selection.focusNode)) {
            return selection.toString()
        }

        return ''
    }

    /**
     * Copies the currently selected error text to the clipboard
     *
     * @return {String}
     */
    copySelection () {
        const selection = this.getSelection()
        atom.clipboard.write(selection)

        return selection
    }

    /**
     * Selects all text within the error
     *
     * @param  {DomElement} element - An .error-message element or one of its children
     */
    selectAll (element) {
        while (element && !element.classList.contains('error-message')) {
            element = element.parentElement
        }

        if (element) {
            const selection = window.getSelection()
            selection.removeAllRanges()
            const range = document.createRange()
            range.selectNodeContents(element)
            selection.addRange(range)
        }
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
     * Expands/Collapses all nodes
     *
     * @param  {Boolean} expand - True to expand, false to collapse
     *
     * @return {Promise}        - Resolves when rendering complete
     */
    updateExpansion (expand) {
        return this.scheduleUpdate(() => {
            this.refs.tree.getChildNodes().forEach(treeNode => {
                treeNode.setCollapsed(!expand)
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

                if (0 < checkedChildren.length) {
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
    onSelectListItem ({node, selected}) {
        const parentNode = node.getParentNode()
        const modifier = selected ? 1 : -1

        this.selectedCount += modifier

        if (parentNode instanceof EtchTreeView) {
            const childNodes = node.getChildNodes()
            let toggled = 0

            childNodes.forEach(child => {
                if (child.isSelected() !== selected) {
                    this.selectedCount += modifier
                    toggled++
                    child.setSelected(selected)
                }
            })

            if (!selected && toggled === childNodes.length) {
                node.setSelected(true)
                this.selectedCount++
            }
        } else if (selected) {
            const childNodes = parentNode.getChildNodes()
            let selectedChildrenCount = 0

            for (const child of childNodes) {
                if (child.isSelected()) {
                    selectedChildrenCount++
                } else {
                    break
                }
            }

            if (selectedChildrenCount === childNodes.length) {
                this.selectedCount++
                parentNode.setSelected(true)
            }
        } else if (parentNode.isSelected()) {
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
            let lines = []

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
                            onClick: openInAtom.bind(null, match[3], match[4], true)
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

            if (0 !== this.maxErrorLines && lines.length > this.maxErrorLines) {
                const truncated = lines.slice(this.maxErrorLines)
                lines = lines.slice(0, this.maxErrorLines)

                const expand = (event) => {
                    event.target.style.display = 'none'
                    event.target.nextSibling.style.display = 'block'
                }

                const expando = (
                    <div className="more">
                        <span className="file-link" onClick={expand}>More...</span>
                        <div style={{display: 'none'}}>{ truncated }</div>
                    </div>
                )

                lines.push(expando)
            }

            return (
                <li className="list-item">
                    <div className="error-message native-key-bindings">
                        { lines }
                    </div>
                </li>
            )
        }).filter((n) => !!n)
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

        const attributes = {
            collapsed: true
        }

        const dataset = {
            state: state,
            name: report.getName(),
            file: report.getFilePath()
        }

        if (report.isCaseReport()) {
            dataset.line = report.getFileLine()
            dataset.suite = report.getSuiteName()

            if (!this.filters.all && !(state in this.filters)) {
                attributes.disabled = true
            }

            className = 'test-case'
        } else {
            let count = 0
            for (const child of children) {
                if (child.props.disabled) {
                    count++
                }
                if (false === child.props.collapsed) {
                    attributes.collapsed = false
                }
            }
            if (count === children.length) {
                attributes.disabled = true
            }

            className = 'test-class'
        }

        if ('passed' === state || report.isSuiteReport()) {
            dataset.time = report.getTime().toFixed(5)
            time = <span className="test-time">{ dataset.time + 's' }</span>
        }

        const errors = this.createErrorItems(report.isCaseReport() ? report.getErrors() : [])

        if (errors.length) {
            attributes.collapsed = false
        }

        const handleDoubleClick = () => {
            openInAtom(report.getFilePath(), report.getFileLine(), true)
        }

        return (
            <EtchTreeNode
                { ...attributes }
                key={ report.getUniqueId() }
                className={ className }
                dataset={ dataset }
                onDidSelect={ this.onSelectListItem.bind(this) }
                icon={ icons[report.getState()] }
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
     * Sorts the virtual dom nodes by placing errors first
     *
     * @param  {Array<VirtualDom>} children - The virtual dom list
     */
    sortChildren (children) {
        const comparator = (a, b) => {
            return -compareStates(a.props.dataset.state, b.props.dataset.state)
        }

        for (const child of children) {
            // The first grandchild is always the <ul> header
            if (child.children && 2 < child.children.length) {
                const header = child.children.shift()
                child.children.sort(comparator)
                child.children.unshift(header)
            }
        }

        children.sort(comparator)
    }

    /**
     * Creates the virtual dom for the header bar
     *
     * @return {VirtualDom}
     */
    renderHeader () {
        const handleClick = (event, which) => {
            this.scheduleUpdate(() => {
                let dir = event.target.classList.contains('asc') ? 'desc' : 'asc'

                if ('desc' === dir) {
                    event.target.classList.remove('asc')
                    event.target.classList.add('desc')
                } else {
                    event.target.classList.remove('desc')
                    event.target.classList.add('asc')
                }

                this.sort(which, dir)
            })
        }

        return (
            <div className="php-unit-report-header">
                <span className="sort sort-state asc" onClick={(event) => handleClick(event, 'state')}>{ "State" }</span>
                <span className="sort sort-name"  onClick={(event) => handleClick(event, 'name')}>{ "Name" }</span>
                <span className="sort sort-time"  onClick={(event) => handleClick(event, 'time')}>{ "Time" }</span>
            </div>
        )
    }

    /**
     * Generates the virtual DOM
     *
     * @private
     * @return {VirtualDom}
     */
    render () {
        const header = this.renderHeader()
        const children = []
        let spinner = null

        if (this.report) {
            for (const suiteReport of this.report.getTestSuiteReports()) {
                const nodes = suiteReport.getCaseReports().map(caseReport => {
                    return this.createListItem(caseReport)
                })

                children.push(this.createListItem(suiteReport, nodes))
            }

            this.sortChildren(children)
        }

        if (0 === children.length && this.pendingReport) {
            spinner = (
                <div className="php-unit-report-loading">
                    <span className='loading loading-spinner-large inline-block'></span>
                </div>
            )
        }

        return (
            <div className="php-unit-report-view">
                { spinner || header }
                <EtchTreeView ref="tree" className="php-unit-report-tree">
                    {children}
                </EtchTreeView>
            </div>
        )
    }
}
