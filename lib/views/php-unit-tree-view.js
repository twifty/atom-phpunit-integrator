/** @babel */
/** @jsx etch.dom */
/* global document */

import {CompositeDisposable} from 'atom'
import Path from 'path'

const BACK_SLASH = /\\/g
const DOUBLE_SLASH = /\/\//

function normalize (path) {
	path = path.replace(BACK_SLASH, '/')

	while (path.match(DOUBLE_SLASH)) {
		path = path.replace(DOUBLE_SLASH, '/')
	}

	return path
}

function splitFilePath (base, path) {
	if (!path.startsWith(base)) {
		throw new Error(`Paths are not related '${base}' -> '${path}'`)
	}

	const slugs = normalize(path.substring(base.length + 1)).split('/')
	const file = slugs.pop()

	return {
		slugs,
		file
	}
}

function indexify (node) {
	const indexed = {}

	for (const child of node.entries.childNodes) {
		if (child.directory) {
			indexed[child.directory.name] = child
		} else if (child.file) {
			indexed[child.file.name] = child
		}
	}

	return indexed
}

function applyCoverage (element, coverage) {
	element.textContent = `(${coverage}%)`

	return element
}

function createElement (coverage) {
	const element = document.createElement('span')

	element.classList.add('coverage')

	return applyCoverage(element, coverage)
}

class FileStats
{
	/**
	 * Constructor
	 *
	 * @constructor
	 * @param {DomElement} node     - The element which represents this file in the tree
	 * @param {String}     name     - The basename of the file
	 * @param {Number}     coverage - The inital file coverage as a percentage
	 */
	constructor (node, name, coverage) {
		this.node = node
		this.name = name
		this.coverage = coverage

		this.element = createElement(coverage)

		node.appendChild(this.element)
	}

	/**
	 * Destructor
	 */
	destroy () {
		if (this.element && this.element.parentNode) {
			this.element.parentNode.removeChild(this.element)
		}

		this.node = null
		this.element = null
	}

	/**
	 * Returns the coverage as a percentage
	 *
	 * @return {Number}
	 */
	getCoverage () {
		return this.coverage
	}

	/**
	 * Updates the coverage percentage and element
	 *
	 * @param  {Number} coverage - The coverage as a percentage
	 */
	update (coverage) {
		this.coverage = Math.max(this.coverage, coverage)

		applyCoverage(this.element, this.coverage)
	}
}

class DirectoryStats
{
	/**
	 * Constructor
	 *
	 * @constructor
	 * @param {DomElement} node - The element in the tree view which represent this directory
	 * @param {String}     name - The basename of the directory
	 */
	constructor (node, name) {
		this.node = node
		this.header = node.header
		this.entries = indexify(node)
		this.name = normalize(name)
		this.stats = {}
		this.dirty = true

		this.disposables = new CompositeDisposable()
		this.element = null

		this.disposables.add(node.directory.onDidRemoveEntries((map) => {
			for (const entry of map.values()) {
				if (entry.name in this.stats) {
					this.stats[entry.name].destroy()
				}

				delete this.stats[entry.name]
				delete this.entries[entry.name]
			}
		}))

		this.disposables.add(node.directory.onDidAddEntries(() => {
			this.entries = indexify(node)
		}))
	}

	/**
	 * Destructor
	 */
	destroy () {
		for (const stat of Object.values(this.stats)) {
			stat.destroy()
		}

		if (this.element && this.element.parentNode) {
			this.element.parentNode.removeChild(this.element)
		}

		this.element = null
		this.entries = null
		this.stats = null
		this.disposables.dispose()
	}

	/**
	 * Creates or updates coverage statistics for the given path
	 *
	 * This will mark all parent directories as dirty. It will also create
	 * and append the file elements.
	 *
	 * @param  {String} path     - The full path to the file
	 * @param  {Number} coverage - The code coverage as a percentage
	 */
	createFileStats (path, coverage) {
		const {slugs, file} = splitFilePath(this.name, path)

		let currPath = this.name
		let node = this.node
		let dir = this

		for (const slug of slugs) {
			currPath = Path.join(currPath, slug)
			dir.dirty = true

			if (!(slug in dir.entries) || !dir.entries[slug].directory) {
				throw new Error(`A direcory element for '${currPath}' could not be found!`)
			}

			node = dir.entries[slug]

			if (!(slug in dir.stats)) {
				dir.stats[slug] = new DirectoryStats(node, slug)
			}

			dir = dir.stats[slug]
		}

		currPath = Path.join(currPath, file)
		dir.dirty = true

		if (!(file in dir.entries) || !dir.entries[file].file) {
			throw new Error(`A file element for '${currPath}' could not be found!`)
		}

		node = dir.entries[file]

		if (!(file in dir.stats)) {
			dir.stats[file] = new FileStats(node, file, coverage)
		} else {
			dir.stats[file].update(coverage)
		}
	}

	/**
	 * Calculates the coverage percentage of a directory
	 *
	 * This recursively calls all dirty directories to update their elements.
	 *
	 * @return {Number} - The covered percentage
	 */
	getCoverage () {
		if (this.dirty) {
			let total = 0
			let accumalated = 0

			for (const stat of Object.values(this.stats)) {
				accumalated += stat.getCoverage()
				total++
			}

			this.coverage = total ? accumalated / total : 0
			this.dirty = false

			if (!this.element) {
				this.element = createElement(this.coverage)
				this.header.appendChild(this.element)
			} else {
				applyCoverage(this.element, this.coverage)
			}
		}

		return this.coverage
	}
}

export default class PhpUnitTreeView
{
	/**
	 * Constructor
	 *
	 * @constructor
	 * @param {PhpUnitTestRunner} testRunner - The main test runner instance
	 * @param {TreeView}          treeView   - The tree view instance from the tree-view package
	 */
	constructor (testRunner, treeView) {
		this.testRunner = testRunner
		this.treeView = treeView
		this.disposables = new CompositeDisposable()
		this.stats = {}

		this.registerTestListeners()
	}

	/**
	 * Destructor
	 */
	destroy () {
		this.disposables.dispose()

		for (const stat of Object.values(this.stats)) {
			stat.destroy()
		}

		this.stats = null
	}

	/**
	 * Attaches listeners to the test runner
	 *
	 * @private
	 */
	registerTestListeners () {
		this.disposables.add(this.testRunner.onDidCompleteTest(({project}) => {
			if (project.isCodeCoverageEnabled()) {
				const report = project.getCoverageReport()
				const root = project.getRoot()

				this.updateCoverageStatistics(root, report)
			}
		}))
	}

	/**
	 * Returns the element at tree root for the given path
	 *
	 * @private
	 * @param  {String} rootDir - The root path to a project directory
	 *
	 * @return {DomElement}     - The root node
	 */
	getTreeRoot (rootDir) {
		for (const dirNode of this.treeView.roots) {
			if (dirNode.directory && dirNode.getPath() === rootDir) {
				return dirNode
			}
		}

		throw new Error(`The tree root (${rootDir}) could not be found`)
	}

	/**
	 * Creates or updates the stats for each directory and file with code coverage
	 *
	 * @private
	 * @param  {String}         rootDir - The root directory of the tested project
	 * @param  {CoverageReport} report  - The covered files data
	 */
	updateCoverageStatistics (rootDir, report) {
		const treeRoot = this.getTreeRoot(rootDir)

		if (!(rootDir in this.stats)) {
			this.stats[rootDir] = new DirectoryStats(treeRoot, rootDir)
		}

		const statRoot = this.stats[rootDir]

		for (const fileCoverage of report.getFileReports()) {
			const path = fileCoverage.getFilePath()
			const coverage = fileCoverage.getCoveredPercent()

			statRoot.createFileStats(path, coverage)
		}

		statRoot.getCoverage()
	}
}
