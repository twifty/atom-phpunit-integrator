/** @babel */
/* global atom console Promise WeakMap */

import {CompositeDisposable, Point, Range} from 'atom'

import {
  // waitForCondition,
  fileExists,
  openInAtom,
  offsetRange,
  offsetPoint} from '../util/php-unit-utils'
import PhpUnitSkelgenView from '../views/php-unit-skelgen-view'
import PhpSkelgenFactory from './php-skelgen-factory'

export default class PhpUnitObserver
{
  /**
   * Initializes the instance
   *
   * @constructor
   * @param {Service} service - The service instance provided by php integrator
   */
  constructor (service) {
    this.service = service
    this.disposables = new CompositeDisposable()
    this.factory = new PhpSkelgenFactory()

    this.observing = {}
    this.excluding = {}

    this.classRanges = new WeakMap()
    this.methodRanges = new WeakMap()
    this.classMapping = new WeakMap()
    this.methodMapping = new WeakMap()

    this.disposables.add(atom.commands.add('atom-text-editor', {
      'php-unit-integrator:editor-goto-testcase':  this.onGotoTest.bind(this, true),
      'php-unit-integrator:editor-goto-testsuite': this.onGotoTest.bind(this, false),
    }))

    this.createContextMenu()
    this.beginObservers()
  }

  /**
   * Destroys all internal references
   */
  destroy () {
    this.disposables.dispose()
    this.classRanges.clear()
    this.methodRanges.clear()
    this.classMapping.clear()
    this.methodMapping.clear()
  }

  /**
   * Adds the context menu items to the atom text editor
   * @private
   */
  createContextMenu () {
    this.disposables.add(atom.contextMenu.add({
      "atom-text-editor": [
        {
          "label": "Go to TestCase",
          "command": "php-unit-integrator:editor-goto-testcase",
          "shouldDisplay": (event) => {
            this.currentMethodRange = this.getRangeForEvent(event, this.methodRanges)
            return !!this.currentMethodRange
          }
        },{
          "label": "Go to TestSuite",
          "command": "php-unit-integrator:editor-goto-testsuite",
          "shouldDisplay": (event) => {
            this.currentClassRange = this.getRangeForEvent(event, this.classRanges)
            return !!this.currentClassRange
          }
        },{
          type: 'separator',
        },
      ]
    }))

    // Shift menu items to the front
    atom.contextMenu.itemSets.unshift(atom.contextMenu.itemSets.pop())
  }

  /**
   * Hooks the open and future text editors and updates the ranges after any changes
   */
  beginObservers () {
    this.service.activate().then(() => {
      this.disposables.add(this.service.onDidFinishIndexing(({path: paths}) => {
        if (!Array.isArray(paths)) {
          this.createRangesForEditors(this.observing[paths])
        } else {
          for (const path of paths) {
            this.createRangesForEditors(this.observing[path])
          }
        }
      }))

      this.disposables.add(atom.workspace.observeTextEditors(this.observeTextEditor.bind(this)))
    })

    // const proxy = this.service.proxy
    // const isServiceInitialized = proxy.getIndexDatabasePath.bind(proxy)
    //
    // waitForCondition(isServiceInitialized, 60).then(() => {
    //   this.disposables.add(atom.workspace.observeTextEditors(this.observeTextEditor.bind(this)))
    // }).catch(error => {
    //   if ('timed out' === error) {
    //     throw new Error("Timed out waiting for php-integrator ready state")
    //   }
    //
    //   throw error
    // })
  }

  /**
   * Checks if the editor is for a PHP file
   *
   * @private
   * @param  {TextEditor}  editor - An atom text editor instance
   *
   * @return {Boolean}            - true if it is a PHP file
   */
  isEditorOfInterest (editor) {
    if (editor) {
      const grammar = editor.getGrammar()

      if (grammar && grammar.scopeName === 'text.html.php') {
        return true
      }
    }

    return false
  }

  /**
   * Caches the editors by file path
   *
   * Keeping references to editors with ranges allows us to fetch
   * them quickly after they have been reindexed.
   *
   * @private
   * @param  {TextEditor}  editor - An atom text editor instance
   */
  observeTextEditor (editor) {
    if (!this.isEditorOfInterest(editor)) {
      return
    }

    const path = editor.getPath()

    editor.onDidDestroy(() => {
      this.clearRangesForEditor(editor)

      const list = this.observing[path]
      const index = list && list.indexOf(editor)

      if (list && 0 <= index) {
        if (1 === list.length) {
          delete this.observing[path]
        } else {
          list.splice(index, 1)
        }
      }
    })

    // NOTE It's possible for multiple editors to be open for the same path
    if (!this.observing[path]) {
      this.observing[path] = [editor]
    } else {
      this.observing[path].push(editor)
    }

    this.createRangesForEditor(editor)
  }

  /**
   * Finds a range containing the point of the event
   *
   * The return value of this method determines if the menu entry should
   * be displayed or not. It's important this method is fast.
   *
   * @private
   * @param  {MouseEvent} event - The mouse event which prompted the context menu
   * @param  {WeakMap}    scope - One of either class or method range sets
   *
   * @return {Range=}           - The range containing the click
   */
  getRangeForEvent (event, scope) {
    const editor = atom.workspace.getActiveTextEditor()
    const filePosition = this.getTextBufferPosition(event, editor)

    if (!editor || !scope.has(editor) || !filePosition) {
      return
    }

    if (!editor.getElement().contains(event.target)) {
      return
    }

    const ranges = scope.get(editor)

    for (const range of ranges) {
      if (range.containsPoint(filePosition)) {
        return range
      }
    }
  }

  /**
   * Converts the mouse event coordinates to a TextBuffer Point offset
   *
   * @private
   * @param  {MouseEvent} event  - The mouse event which prompted the context menu
   * @param  {TextEditor} editor - The currently active text editor
   *
   * @return {Point}             - The buffer position
   */
  getTextBufferPosition (event, editor) {
    if (editor && event) {
      const {component} = atom.views.getView(editor)
      const screenPosition = component.screenPositionForMouseEvent(event)

      return {
        row: editor.bufferRowForScreenRow(screenPosition.row),
        column: screenPosition.column
      }
    }
  }

  /**
   * Builds ranges for multiple editors
   *
   * @private
   * @see {@link createRangesForEditor}
   * @param  {Array} editors - The text editors for which to build ranges
   */
  createRangesForEditors (editors) {
    if (editors) {
      for (const editor of editors) {
        this.createRangesForEditor(editor)
      }
    }
  }

  /**
   * Clears then rebuilds the ranges available within the editors text
   *
   * This is called every time an editor being observed has changed. It queries
   * the database for the classlist then for each class info. It then stores
   * the buffer ranges and a mapping info object for each class and method found.
   *
   * @todo Enable a way to cancel when reindex is called on same editor
   *
   * @private
   * @param  {TextEditor}  editor - An atom text editor instance
   *
   * @return {Promise}            - Resolves with nothing
   */
  async createRangesForEditor (editor) {
    if (!this.isEditorOfInterest(editor)) {
      return
    }

    const path = editor.getPath()

    if (!path || !this.observing[path] || this.excluding[path]) {
      return
    }

    this.clearRangesForEditor(editor)

    try {
      const classList = await this.service.getClassListForFile(path)
      const resolvers = Object.keys(classList).map(name => {
        return this.service.getClassInfo(name)
      })

      const classInfos = await Promise.all(resolvers)

      const classRanges = []
      const methodRanges = []

      for (const classInfo of classInfos) {
        if (0 <= classInfo.parents.indexOf("\\PHPUnit\\Framework\\TestCase")) {
          this.excluding[path] = true
          continue
        }

        const classRange = new Range([classInfo.startLine - 1, 0],[classInfo.endLine - 1, 0])
        const classMap = this.mapClassInfo(classInfo)

        classRanges.push(classRange)
        this.classMapping.set(classRange, classMap)

        for (const methodInfo of Object.values(classInfo.methods)) {
          if (methodInfo.isPublic && !methodInfo.isAbstract) {
            if ('__construct' !== methodInfo.name && path === methodInfo.filename) {
              const methodRange = new Range([methodInfo.startLine - 1, 0], [methodInfo.endLine - 1, 0])
              const methodMap = this.mapMethodInfo(methodInfo)

              methodRanges.push(methodRange)
              this.methodMapping.set(methodRange, methodMap)
            }
          }
        }
      }

      this.classRanges.set(editor, classRanges)
      this.methodRanges.set(editor, methodRanges)
    } catch (e) {
      if (e.response && e.response.error) {
        // This appears to be a generic not found error code. It's possible for
        // a TextEditor to have PHP content in an in-memory file.
        if (e.response.error.code !== -32001) {
          console.error(`The PHP service responded with error (${e.response.error.code}) "${e.response.error.message}"`)
        }
      } else {
        console.error(e)
      }
    }
  }

  /**
   * Deletes all cached ranges associated with the editor
   *
   * @private
   * @param  {TextEditor}  editor - An atom text editor instance
   */
  clearRangesForEditor (editor) {
    if (this.classRanges.has(editor)) {
      for (const range of this.classRanges.get(editor)) {
        this.classMapping.delete(range)
      }
      this.classRanges.delete(editor)
    }

    if (this.methodRanges.has(editor)) {
      for (const range of this.methodRanges.get(editor)) {
        this.methodMapping.delete(range)
      }
      this.methodRanges.delete(editor)
    }
  }

  /**
   * Converts a classinfo object from the database to a smaller object
   *
   * @private
   * @param  {Object} classInfo - the database query result
   *
   * @return {Object}           - a compacted version of the input
   */
  mapClassInfo (classInfo) {
    const names = classInfo.fqcn.split('\\').slice(0, -1)

    const source = {
      path: classInfo.filename,
      name: classInfo.name,
      namespace: names.join('\\'),
      type: classInfo.isAbstract ? 'abstract' : classInfo.type,
      fqcn: classInfo.fqcn
    }

    return source
  }

  /**
   * Converts a methodinfo object from the database to a smaller object
   *
   * @private
   * @param  {Object} classInfo - the database query result
   *
   * @return {Object}           - a compacted version of the input
   */
  mapMethodInfo (methodInfo) {
    const source = {
      method: methodInfo.name
    }

    return source
  }

  /**
   * Checks if the source meta was correctly translated to a target meta
   *
   * @private
   * @param  {Object}  target - the translated target meta data
   *
   * @return {Boolean}        - true if it is valid
   */
  isValidTarget (target) {
    if (target && target.path && target.fqcn) {
      return true
    }

    atom.notifications.addError("Failed to map a source file to a test directory", {
      dismissable: true
    })
  }

  /**
   * Returns the translated target meta related to the last mouse click query
   *
   * NOTE invalid results will be returned if this is not called as the direct
   * result of a command initiated by the context menu.
   *
   * @private
   * @return {Object} - The translated target meta
   */
  getMappedInfo () {
    let method = {}

    if (this.currentMethodRange) {
      method = this.methodMapping.get(this.currentMethodRange)
      method = Object.assign({}, method)
    }

    if (!this.currentClassRange) {
      return
    }

    const cached = this.classMapping.get(this.currentClassRange)
    const source = Object.assign({}, cached, method)
    const target = this.factory.describeTarget(Object.assign({}, source))

    return {source, target}
  }

  /**
   * The context menu command handler
   *
   * @private
   * @param  {Boolean}  gotoMethod - a flag to distinguish between class and method
   *
   * @return {Promise}             - Resolves with nothing
   */
  async onGotoTest (gotoMethod) {
    const {source, target} = this.getMappedInfo()

    if (!this.isValidTarget(target)) {
      return
    }

    try {
      const classInfo = await this.service.getClassInfo(target.fqcn)

      let {filename, startLine} = classInfo

      if (gotoMethod) {
        if (!target.method) {
          console.error("TestCase was selected, but its method name is not available!")
        } else if (!classInfo.methods[target.method]) {
          return this.promptToCreate(source, target, classInfo)
        } else {
          startLine = classInfo.methods[target.method].startLine
        }
      }

      // Use await to catch the errors
      await openInAtom(filename, startLine)

    } catch (error) {
      // Edge case where class exists in database but backing file was deleted
      if (error instanceof Error && error.message.includes('ENOENT')) {
        return this.promptToCreate(source, target)
      } else if (error.response && error.response.error) {
        // NOTE a feature request has been submitted for better code handling
        if (error.response.error.code === -32001) {
          return this.promptToCreate(source, target)
        }
        console.error(error.response.message)
      } else {
        console.error(error)
      }
    }
  }

  /**
   * Creates a modal dialog asking user if they want to create the class/method
   *
   * @param  {Object} source      - the source meta
   * @param  {Object} target      - the target meta
   * @param  {Object} [classInfo] - the database query result
   *
   * @return {Promise}            - Resolves with nothing
   */
  promptToCreate (source, target, classInfo) {
    if (!this.promptView) {
      this.promptView = new PhpUnitSkelgenView()
    }

    if (!classInfo || !target.method) {
      return this.promptView.open(target, this.generateTestSuite.bind(this, source, target))
    }

    return this.promptView.open(target, this.generateTestCase.bind(this, source, target, classInfo))
  }

  /**
   * Helper method for cursor/selection positioning in test file
   *
   * @private
   * @param  {Object} meta          - the content about to be rendered
   * @param  {Number} [startLine=0] - the insertion position within the file
   *
   * @return {Object}               - the adjusted text cursor and selection range
   */
  offsetCursor (meta, startLine = 0) {
    const cursor = new Point(startLine, 0)
    const select = new Range(new Point(startLine, 0), new Point(startLine, 0))

    if (meta.cursor) {
      offsetPoint(cursor, meta.cursor, false)
    }

    if (meta.select) {
      offsetRange(select, meta.select, false)
    }

    return {
      text: typeof meta.text === 'string' ? meta.text : meta,
      cursor,
      select
    }
  }

  /**
   * Creates a new file containing a blank test suite and optional method
   *
   * @private
   * @param  {Object}  source - the source meta data
   * @param  {Object}  target - the target meta data
   *
   * @return {Promise}        - Resolves with nothing
   */
  async generateTestSuite (source, target) {
    this.excluding[target.path] = true

    try {
      const meta = this.factory.createTestSuite(source, target)
      const editor = await atom.workspace.open(target.path)

      const {text, cursor, select} = this.offsetCursor(meta)

      editor.setText(text)

      if (!select.isEmpty()) {
        editor.setSelectedBufferRange(select)
      } else {
        editor.setCursorBufferPosition(cursor)
      }

      editor.scrollToCursorPosition()

      await editor.save()

      this.service.reindex(target.path, editor.getBuffer().getText())
    } catch (error) {
      console.error(error)
    }
  }

  /**
   * Appends a new test case method to an existing test suite
   *
   * @private
   * @param  {Object}  source      - the source meta data
   * @param  {Object}  target      - the target meta data
   * @param  {Object}  [classInfo] - the database query result
   *
   * @return {Promise}             - Resolves with nothing
   */
  async generateTestCase (source, target, classInfo) {
    if (!classInfo) {
      return this.generateTestSuite(source, target)
    }

    const insertAt = classInfo.endLine - 1

    try {
      const exists = await fileExists(target.path)

      if (!exists) {
        return this.generateTestSuite(source, target)
      }

      const meta = this.factory.createTestCase(source, target)
      const editor = await atom.workspace.open(target.path)

      const {text, cursor, select} = this.offsetCursor(meta, insertAt)

      editor.setTextInBufferRange(new Range([insertAt, 0], [insertAt, 0]), text)

      if (!select.isEmpty()) {
        editor.setSelectedBufferRange(select)
      } else {
        editor.setCursorBufferPosition(cursor)
      }

      editor.scrollToCursorPosition()

    } catch (error) {
      console.error(error)
    }
  }
}
