/** @babel */
/** @jsx etch.dom */
/* global atom document */

import {CompositeDisposable} from 'atom'

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
    const precentage = coverage.total ? ((coverage.covered / coverage.total) * 100) : 0

    element.textContent = `(${Math.floor(precentage)}%)`

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
     * @param {String}     name             - The basename of the file
     * @param {Object}     coverage         - The code coverage
     * @param {Number}     coverage.total   - The covered total lines
     * @param {Number}     coverage.covered - The covered line count
     * @param {DomElement} [node]           - The element which represents this file in the tree
     */
    constructor (name, coverage, node) {
        this.node = node
        this.name = name
        this.coverage = coverage

        this.element = createElement(coverage)

        if (this.node) {
            this.node.appendChild(this.element)
        }
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
     * Returns the file stats as a json encodable object
     *
     * @return {Object} - The state of the file
     */
    serialize () {
        return {
            name: this.name,
            type: 'file',
            coverage: this.coverage
        }
    }

    /**
     * Creates a new instance from previously serialized data
     *
     * @param  {Object}    meta - The previous state
     *
     * @return {FileStats}      - The new instance
     */
    static deserialize (meta) {
        return new FileStats(meta.name, meta.coverage)
    }

    /**
     * Returns the coverage
     *
     * @return {Object}
     */
    getCoverage () {
        return this.coverage
    }

    /**
     * Applies a new coverage number and updates the element
     *
     * @param {Object} coverage         - The code coverage
     * @param {Number} coverage.total   - The covered total lines
     * @param {Number} coverage.covered - The covered line count
     */
    setCoverage (coverage) {
        this.coverage.covered = Math.max(this.coverage.covered, coverage.covered)

        applyCoverage(this.element, this.coverage)
    }

    /**
     * Associates/Disassociates the stat with an element
     *
     * @param  {DomElement} [node] - The element representing the file in the tree
     */
    update (node) {
        this.node = node

        if (this.node) {
            node.appendChild(this.element)
        }
    }
}

class DirectoryStats
{
    /**
     * Creates or updates coverage statistics for the given path
     *
     * This will mark all parent directories as dirty. It will also create
     * and append the file elements.
     *
     * @static
     * @param  {DirectoryStats} dir              - The root directory stat
     * @param  {String}         path             - The full path to the file
     * @param  {Object}         coverage         - The code coverage
     * @param  {Number}         coverage.total   - The covered total lines
     * @param  {Number}         coverage.covered - The covered line count
     */
    static createFileStats (dir, path, coverage) {
        const {slugs, file} = splitFilePath(dir.name, path)

        let node = dir.node

        for (const slug of slugs) {
            dir.dirty = true

            if (dir.entries && slug in dir.entries && dir.entries[slug].directory) {
                node = dir.entries[slug]
            } else {
                node = null
            }

            if (!(slug in dir.stats)) {
                dir.stats[slug] = new DirectoryStats(slug, node)
            }

            dir = dir.stats[slug]
        }

        dir.dirty = true

        if (dir.entries && file in dir.entries && dir.entries[file].file) {
            node = dir.entries[file]
        } else {
            node = null
        }

        if (!(file in dir.stats)) {
            dir.stats[file] = new FileStats(file, coverage, node)
        } else {
            dir.stats[file].setCoverage(coverage)
        }
    }

    /**
     * Constructor
     *
     * @constructor
     * @param {String}     name   - The basename of the directory
     * @param {DomElement} [node] - The element in the tree view which represent this directory
     */
    constructor (name, node) {
        this.node = null
        this.header = null
        this.entries = null
        this.element = null

        this.name = normalize(name)
        this.stats = {}
        this.dirty = true

        if (node) {
            this.node = node
            this.header = node.header
            this.entries = indexify(node)

            this.attachListeners()
        }
    }

    /**
     * Associates/Disassociates the stat with an element
     *
     * @param  {DomElement} [node] - The element representing the file in the tree
     */
    update (node) {
        this.node = node

        if (this.node) {
            this.header = node.header
            this.entries = indexify(node)

            const coverage = this.getCoverage()

            if (!this.element) {
                this.element = createElement(coverage)
            } else {
                applyCoverage(this.element, coverage)
            }

            this.header.appendChild(this.element)

            this.attachListeners()
        } else {
            this.header = null
            this.entries = null

            this.removeListeners()
        }

        for (const key of Object.keys(this.stats)) {
            const stat = this.stats[key]

            if (this.entries && key in this.entries) {
                stat.update(this.entries[key])
            } else {
                stat.update(null)
            }
        }
    }

    /**
     * Destructor
     */
    destroy () {
        this.removeListeners()

        for (const stat of Object.values(this.stats)) {
            stat.destroy()
        }

        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element)
        }

        this.element = null
        this.entries = null
        this.stats = null
        this.destroyed = true
    }

    /**
     * Returns the directory stats as a json encodable object
     *
     * @return {Object} - The state of the directory
     */
    serialize () {
        const meta = {
            name: this.name,
            type: 'directory',
            stats: {}
        }

        for (const stat of Object.values(this.stats)) {
            meta.stats[stat.name] = stat.serialize()
        }

        return meta
    }

    /**
     * Creates a new instance from previously serialized data
     *
     * @param  {Object}         meta - The previous state
     *
     * @return {DirectoryStats}      - The new instance
     */
    static deserialize (meta) {
        const dir = new DirectoryStats(meta.name)

        for (const stat of Object.values(meta.stats)) {
            let item

            if (stat.type === 'directory') {
                item = DirectoryStats.deserialize(stat)
            } else {
                item = FileStats.deserialize(stat)
            }

            dir.stats[item.name] = item
        }

        return dir
    }

    /**
     * Begins the listeners on the associated dom element
     *
     * @private
     */
    attachListeners () {
        this.removeListeners()

        this.disposables = new CompositeDisposable()

        this.disposables.add(this.node.directory.onDidRemoveEntries((map) => {
            for (const entry of map.values()) {
                if (entry.name in this.stats) {
                    this.stats[entry.name].destroy()
                }

                delete this.stats[entry.name]
                delete this.entries[entry.name]
            }
        }))

        this.disposables.add(this.node.directory.onDidAddEntries(() => {
            this.entries = indexify(this.node)
        }))

        this.disposables.add(this.node.directory.onDidExpand(() => {
            this.entries = indexify(this.node)

            for (const key of Object.keys(this.stats)) {
                const stat = this.stats[key]

                if (!(key in this.entries)) {
                    // This can occur with temp files removed during a test
                    console.warn(`Removing treeview stats node for missing file '${stat.name}'`); // eslint-disable-line

                    this.stats[key].destroy()
                    delete this.stats[key]
                } else {
                    stat.update(this.entries[key])
                }
            }
        }))

        this.disposables.add(this.node.directory.onDidCollapse(() => {
            this.entries = indexify(this.node)

            for (const key of Object.keys(this.stats)) {
                const stat = this.stats[key]

                stat.update(null)
            }
        }))
    }

    /**
     * Removes the listeners on the associated dom element
     *
     * @private
     */
    removeListeners () {
        if (this.disposables) {
            this.disposables.dispose()
            this.disposables = null
        }
    }

    /**
     * Calculates the coverage percentage of a directory
     *
     * This recursively calls all dirty directories to update their coverage.
     *
     * @private
     * @return {Object} - The coverage
     */
    getCoverage () {
        if (this.dirty) {
            this.coverage = {
                total: 0,
                covered: 0
            }

            for (const stat of Object.values(this.stats)) {
                const statCoverage = stat.getCoverage()

                this.coverage.total += statCoverage.total
                this.coverage.covered += statCoverage.covered
            }

            this.dirty = false
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
     * @param {PhpUnitWorkspace}  config     - The package workspace
     * @param {TreeView}          treeView   - The tree view instance from the tree-view package
     */
    constructor (workspace, treeView) {
        this.config = workspace.getPackageConfig()
        this.testRunner = workspace.getProjectTester()
        this.treeView = treeView
        this.disposables = new CompositeDisposable()
        this.stats = {}

        if (this.config.get('enable-tree-view')) {
            this.enabled = true
            this.registerTestListeners()
        }

        this.disposables.add(this.config.onDidChange(({name, value}) => {
            if ('enable-tree-view' === name) {
                this.enabled = value

                if (!this.enabled) {
                    this.clear()
                }
            }
        }))
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
     * Returns the tree stats as a json encodable object
     *
     * @return {Object} - The state of the tree
     */
    serialize () {
        const meta = {}

        for (const stat of Object.values(this.stats)) {
            meta[stat.name] = stat.serialize()
        }

        return meta
    }

    /**
     * Initializes the tree with data from a previous session
     *
     * @param  {Object}  meta - The state of the tree
     *
     * @return {Promise}      - Resolves when tree has initialized
     */
    deserialize (meta) {
        return this.clear().then(() => {
            for (const name of Object.keys(meta)) {
                const statRoot = DirectoryStats.deserialize(meta[name])
                const treeRoot = this.getTreeRoot(name)

                statRoot.update(treeRoot)

                this.stats[name] = statRoot
            }
        })
    }

    /**
     * Clears all coverage cache and tree view elements
     *
     * @return {Promise}
     */
    clear () {
        atom.views.updateDocument(() => {
            for (const stat of Object.values(this.stats)) {
                stat.destroy()
            }

            this.stats = {}
        })

        return atom.views.getNextUpdatePromise()
    }

    /**
     * Attaches listeners to the test runner
     *
     * @private
     */
    registerTestListeners () {
        this.disposables.add(this.testRunner.onDidCompleteTest(({project}) => {
            if (this.enabled && project.isCoverageEnabled()) {
                const report = project.getCoverageReport()
                const root = project.getRoot()

                this.updateCoverageStatistics(root, report)
            }
        }))

        this.disposables.add(this.testRunner.onClearAll(() => {
            return this.clear()
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
        atom.views.updateDocument(() => {
            const treeRoot = this.getTreeRoot(rootDir)

            if (!(rootDir in this.stats)) {
                this.stats[rootDir] = new DirectoryStats(rootDir, treeRoot)
            }

            const statRoot = this.stats[rootDir]

            for (const fileCoverage of report.getFileReports()) {
                const path = fileCoverage.getFilePath()
                const metrics = fileCoverage.getMetrics()
                const total = metrics.total.lines
                const covered = metrics.covered.lines

                if (total) {
                    // const coverage = total ? ((covered / total) * 100) : 0

                    DirectoryStats.createFileStats(statRoot, path, {total, covered})
                }
            }

            statRoot.update(treeRoot)
        })
    }
}
