/** @babel */
/* global atom console Promise WeakMap */

import {CompositeDisposable} from 'atom'

export default class PhpUnitCoverageMarkers
{
  /**
   * Constructor
   *
   * @param {PhpUnitProjectManager} projectManager - The open project collection
   */
  constructor (projectManager) {
    this.projectManager = projectManager

    this.listeners = new CompositeDisposable()
    this.markedEditors = new WeakMap()
  }

  /**
   * Destructor
   */
  destroy () {
    this.listeners.dispose()
    this.clearMarkersFromEditor()
    this.markedEditors.clear()
  }

  /**
   * Updates the markers with the latest report
   *
   * @param  {Object}                properties        - The update parameters
   * @param  {PhpUnitCoverageReport} properties.report - The latest coverage report
   * @param  {string}                properties.root   - The root directory of the active project
   *
   * @return {Promise}                                 - Resolves with nothing
   */
  update (properties) {
    if (properties.report !== this.report) {
      this.report = properties.report
      this.root = properties.root
      this.projectDir = null

      const dirs = atom.project.getDirectories()
      for (const dir of dirs) {
        if (dir.getPath() === this.root) {
          this.projectDir = dir
          break
        }
      }

      if (!this.projectDir) {
        throw new Error(`Failed to find a Directory for "${this.root}"`)
      }

      if (this.report) {
        return this.report.getCoverage().then(meta => {
          this.meta = meta

          return this.addMarkersToEditors()
        })
      }
    }

    return this.addMarkersToEditors()
  }

  /**
   * Tracks the open and future text editors
   *
   * @param  {Boolean} [observe=true] - Toggles the observation
   */
  observeTextEditors (observe = true) {
    if (observe) {
      this.listeners.add(atom.workspace.observeTextEditors((editor) => {
        this.addMarkersToEditor(editor)
      }))
    } else {
      this.listeners.dispose()
    }
  }

  /**
   * Checks if the editor is for a PHP file
   *
   * @private
   * @param  {TextEditor} editor - The open editor
   *
   * @return {Boolean}
   */
  isEditorOfInterest (editor) {
    if (editor && this.projectDir) {
      const path = editor.getPath()
      const grammar = editor.getGrammar()


      if (grammar && grammar.scopeName === 'text.html.php') {
        if (path && this.projectDir.contains(path)) {
          return true
        }
      }
    }

    return false
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
      if (!this.isEditorOfInterest(editor)) {
        return resolve()
      }

      const path = editor.getPath()

      this.clearMarkersFromEditor(editor)

      if (!this.meta || !this.meta.files || !this.meta.files[path]) {
        return resolve()
      }

      try {
        const lineMeta = this.meta.files[path].lines
        const coveredLayer = editor.addMarkerLayer()
        const uncoveredLayer = editor.addMarkerLayer()

        this.markedEditors.set(editor, [coveredLayer.id, uncoveredLayer.id])

        lineMeta.forEach((count, line) => {
          const layer = count > 0 ? coveredLayer : uncoveredLayer

          layer.markBufferRange([[line - 1, 0], [line - 1, 100]], {invalidate: 'touch'})
        })

        editor.decorateMarkerLayer(coveredLayer, {type: 'highlight', class: 'covered', onlyNonEmpty: true})
        editor.decorateMarkerLayer(uncoveredLayer, {type: 'highlight', class: 'uncovered', onlyNonEmpty: true})
      } catch (e) {
        console.error(e)
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
          layer.destroy()
        }
      }

      this.markedEditors.delete(editor)
    } catch (e) {
      console.error(e)
    }
  }
}
