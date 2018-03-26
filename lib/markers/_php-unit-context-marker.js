/** @babel */
/* global atom window console Promise WeakMap */

import {CompositeDisposable, Range} from 'atom'

import {waitForCondition} from '../util/php-unit-utils'

export default class PhpUnitContextMarker
{
  constructor (proxy) {
    this.proxy = proxy
    this.disposables = new CompositeDisposable()

    this.markedEditors = new WeakMap()
    this.markedRanges = new WeakMap()

    waitForCondition(this.proxy.getIndexDatabasePath.bind(this.proxy), 60).then(() => {
      this.disposables.add(atom.workspace.observeTextEditors((editor) => {
        this.addMarkersToEditor(editor)
      }))

      this.addMarkersToEditors()
      console.log('markers added')
    }).catch(error => {
      if ('timed out' === error) {
        throw new Error("Timed out waiting for Proxy ready state")
      }

      throw error
    })
  }

  destroy () {
    this.disposables.dispose()
    this.clearMarkersFromEditors()
    this.markedEditors.clear()
  }

  isEditorOfInterest (editor) {
    if (editor) {
      const grammar = editor.getGrammar()

      if (grammar && grammar.scopeName === 'text.html.php') {
        return true
      }
    }

    return false
  }

  addMarkersToEditors () {
    const editors = atom.workspace.getTextEditors()
    for (const editor of editors) {
      this.addMarkersToEditor(editor)
    }
  }

  async addMarkersToEditor (editor) {
    if (!this.isEditorOfInterest(editor)) {
      return
    }

    const path = editor.getPath()

    if (!path) {
      return
    }

    this.clearMarkersFromEditor(editor)

    const classMeta = await this.proxy.getClassListForFile(path)
    const resolvers = Object.keys(classMeta).map(name => {
      return this.proxy.getClassInfo(name)
    })

    const classInfos = await Promise.all(resolvers)

    for (const info of classInfos) {
      this.addMarkersForClass(editor, info)
    }
  }

  addMarkersForClass (editor, classInfo) {
    const getLayer = () => {
      if (this.markedEditors.has(editor)) {
        return this.markedEditors.get(editor)
      }

      const classLayer = editor.addMarkerLayer()
      const methodLayer = editor.addMarkerLayer()
      const layers = {
        classLayer,
        methodLayer
      }

      this.markedEditors.set(editor, layers)

      return layers
    }

    // const pushRange (range) {
    //
    // }

    try {
      const {classLayer, methodLayer} = getLayer()
      const classRange = new Range([classInfo.startLine - 1, 0],[classInfo.endLine - 1, 0])

      classLayer.markBufferRange(classRange, {invalidate: 'touch'})

      for (const method of Object.values(classInfo.methods)) {
        if (method.isPublic && !method.isStatic) {
          const methodRange = new Range([method.startLine - 1, 0], [method.endLine - 1, 0])

          methodLayer.markBufferRange(methodRange, {invalidate: 'touch'})
        }
      }

      editor.decorateMarkerLayer(methodLayer, {type: 'highlight', class: 'method-definition', onlyNonEmpty: true})
      editor.decorateMarkerLayer(classLayer, {type: 'highlight', class: 'class-definition', onlyNonEmpty: true})
    } catch (e) {
      console.error(e)
    }
  }

  _addMarkersToEditor (editor) {
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

  clearMarkersFromEditors () {

  }

  clearMarkersFromEditor (editor) {
    // if (!editor || !this.markedEditors.has(editor)) {
    //   return
    // }
    //
    // try {
    //   const layersids = this.markedEditors.get(editor)
    //   if (!layersids) {
    //     return
    //   }
    //
    //   for (const layerid of layersids) {
    //     const layer = editor.getMarkerLayer(layerid)
    //     if (layer) {
    //       layer.destroy()
    //     }
    //   }
    //
    //   this.markedEditors.delete(editor)
    // } catch (e) {
    //   console.error(e)
    // }
  }
}
