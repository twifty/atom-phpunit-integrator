/** @babel */
/* global atom console Promise WeakMap WeakSet */

import {CompositeDisposable} from 'atom'

export default class PhpUnitCoverageMarkers
{
    /**
     * Constructor
     *
     * @constructor
     * @param {PhpUnitWorkspace} workspace - The package workspace
     */
    constructor (workspace) {
        this.projectTester = workspace.getProjectTester()
        this.projectManager = workspace.getProjectManager()
        this.markedEditors = new WeakMap()
        this.enabledProjects = new WeakSet()
        this.disposables = new CompositeDisposable()

        const addProject = (project, state = project.getCoverageState()) => {
            if (state.enabled) {
                this.enabledProjects.add(project)
            }
        }

        this.disposables.add(this.projectManager.onDidProjectsChange(projects => {
            this.enabledProjects = new WeakSet()

            projects.map(addProject)
        }))

        this.disposables.add(this.projectManager.onDidProjectCoverageConfigChange(({project, state}) => {
            addProject(project, state)
        }))

        this.disposables.add(this.projectTester.onClearAll(this.clear.bind(this)))
        this.disposables.add(atom.workspace.observeTextEditors(this.addMarkersToEditor.bind(this)))

        this.disposables.add(this.projectTester.onDidCompleteTest(({project}) => {
            return this.addMarkersToEditors(project)
        }))
    }

    /**
     * Destructor
     */
    destroy () {
        if (this.disposables) {
            this.disposables.dispose()
            this.disposables = null
        }

        this.clearMarkersFromEditor()

        this.markedEditors = null
        this.projectTester = null
    }

    /**
     * Removes all markers from all editors
     *
     * @return {Promise}
     */
    clear () {
        return this.clearMarkersFromEditors()
    }

    /**
     * Adds markers to all open editors
     *
     * @private
     * @param {PhpUnitProject} project - The scope of the editors to apply
     *
     * @return {Promise}
     */
    addMarkersToEditors (project) {
        const promises = []

        if (this.enabledProjects.has(project)) {
            const editors = atom.workspace.getTextEditors()
            const report = project.getCoverageReport()

            for (const editor of editors) {
                if (project.isEditorOfInterest(editor)) {
                    promises.push(
                        this.addMarkersToEditor(editor, report)
                    )
                }
            }
        }

        return Promise.all(promises)
    }

    /**
     * Adds markers to a single editor
     *
     * @private
     * @param {TextEditor}            editor   - The open editor
     * @param {PhpUnitCoverageReport} [report] - An optional coverage report
     *
     * @return {Promise}
     */
    async addMarkersToEditor (editor, report = null) {
        await this.clearMarkersFromEditor(editor)

        const path = editor.getPath()

        try {
            if (!report) {
                const project = this.projectManager.getProjectForEditor(editor)

                report = this.enabledProjects.has(project) && project.getCoverageReport()
            }

            const fileReport = report && report.getFileReport(path)

            if (!fileReport) {
                return
            }

            // const lineMeta = this.meta.files[path].lines
            const coveredLayer = editor.addMarkerLayer()
            const uncoveredLayer = editor.addMarkerLayer()

            this.markedEditors.set(editor, [coveredLayer.id, uncoveredLayer.id])

            fileReport.getLines().forEach((lineReport) => {
                const line = lineReport.getNum() - 1
                const length = editor.getBuffer().lineLengthForRow(line)
                const layer = lineReport.isCovered() ? coveredLayer : uncoveredLayer

                layer.markBufferRange([[line, 0], [line, length]], {invalidate: 'touch'})
            })

            editor.decorateMarkerLayer(coveredLayer, {type: 'highlight', class: 'covered', onlyNonEmpty: true})
            editor.decorateMarkerLayer(uncoveredLayer, {type: 'highlight', class: 'uncovered', onlyNonEmpty: true})
        } catch (error) {
            console.error(error)
        }
    }

    /**
     * Removes markers from all open editors
     *
     * @private
     * @return {Promise}
     */
    clearMarkersFromEditors() {
        const editors = atom.workspace.getTextEditors()
        const promises = editors.map(this.clearMarkersFromEditor.bind(this))

        return Promise.all(promises)
    }

    /**
     * Removes markers from the editor
     *
     * @private
     * @param  {TextEditor} editor - The open or closing editor
     *
     * @return {Promise}
     */
    async clearMarkersFromEditor (editor) {
        if (!editor || !this.markedEditors.has(editor)) {
            return
        }

        try {
            const layersids = this.markedEditors.get(editor)
            if (!layersids) {
                return
            }

            for (const layerid of layersids) {
                const layer = editor.getMarkerLayer(layerid)
                if (layer) {
                    layer.clear()
                    layer.destroy()
                }
            }

            this.markedEditors.delete(editor)
        } catch (error) {
            console.error(error)
        }
    }
}
