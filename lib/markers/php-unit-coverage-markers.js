/** @babel */
/* global atom console Promise WeakMap */

import {CompositeDisposable} from 'atom'

export default class PhpUnitCoverageMarkers
{
	/**
	 * Constructor
	 *
	 * @constructor
	 * @param {PhpUnitProjectTester} projectTester - The main project tester
	 */
	constructor (projectTester) {
		this.projectTester = projectTester

		this.listeners = new CompositeDisposable()
		this.markedEditors = new WeakMap()

		this.toggleListener = this.projectTester.onCodeCoverageToggled(({enabled}) => {
			this.toggle(enabled)
		})

		this.clearAllListener = this.projectTester.onClearAll(() => {
			this.clear()
		})
	}

	/**
	 * Destructor
	 */
	destroy () {
		this.toggleListener.dispose()
		this.clearAllListener.dispose()
		this.listeners.dispose()

		this.clearMarkersFromEditor()

		this.markedEditors = null
		this.toggleListener = null
		this.clearAllListener = null
		this.listeners = null
		this.projectTester = null
	}

	/**
	 * Removes all markers from all editors
	 *
	 * @return {Promise}
	 */
	clear () {
		this.report = null
		this.project = null

		return this.addMarkersToEditors()
	}

	/**
	 * Tracks the open and future text editors
	 *
	 * @param  {Boolean} [observe=true] - Toggles the observation
	 */
	toggle (observe = true) {
		if (observe) {
			this.listeners.add(atom.workspace.observeTextEditors((editor) => {
				this.addMarkersToEditor(editor)
			}))
			this.listeners.add(this.projectTester.onDidCompleteTest(({project}) => {
				this.project = project
				this.report = project.getCoverageReport()

				return this.addMarkersToEditors()
			}))
		} else {
			this.listeners.dispose()
			return this.clear()
		}
	}

	/**
	 * Adds markers to all open editors
	 *
	 * @private
	 */
	addMarkersToEditors () {
		const editors = atom.workspace.getTextEditors()
		const promises = []

		for (const editor of editors) {
			promises.push(
				this.addMarkersToEditor(editor)
			)
		}

		return Promise.all(promises)
	}

	/**
	 * Adds markers to a single editor
	 *
	 * @private
	 * @param {TextEditor} editor - The open editor
	 */
	addMarkersToEditor (editor) {
		return new Promise((resolve) => {
			this.clearMarkersFromEditor(editor)

			if (!this.project || !this.project.isEditorOfInterest(editor)) {
				return resolve()
			}

			const path = editor.getPath()

			if (!this.report) {
				return resolve()
			}

			try {
				const fileReport = this.report.getFileReport(path)

				if (!fileReport) {
					return resolve()
				}

				// const lineMeta = this.meta.files[path].lines
				const coveredLayer = editor.addMarkerLayer()
				const uncoveredLayer = editor.addMarkerLayer()

				this.markedEditors.set(editor, [coveredLayer.id, uncoveredLayer.id])

				fileReport.getLines().forEach((lineReport) => {
					const line = lineReport.getNum()
					const layer = lineReport.isCovered() ? coveredLayer : uncoveredLayer

					// TODO: Use the buffers longest line
					layer.markBufferRange([[line - 1, 0], [line - 1, 100]], {invalidate: 'touch'})
				})

				editor.decorateMarkerLayer(coveredLayer, {type: 'highlight', class: 'covered', onlyNonEmpty: true})
				editor.decorateMarkerLayer(uncoveredLayer, {type: 'highlight', class: 'uncovered', onlyNonEmpty: true})
			} catch (error) {
				console.error(error)
			}

			resolve()
		})
	}

	/**
	 * Removes markers from the editor
	 *
	 * @private
	 * @param  {TextEditor} editor - The open or closing editor
	 */
	clearMarkersFromEditor (editor) {
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
