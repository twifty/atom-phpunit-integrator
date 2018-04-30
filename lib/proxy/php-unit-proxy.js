/** @babel */
/* global WeakMap atom */

import {CompositeDisposable} from 'atom'

import PhpUnitScope from './php-unit-scope'
import PhpCoreService from './php-core-service'

/*
 * This class is heavily tied to the php service. Though a service for another
 * language could be used, it still runs on the concept of classes and methods.
 * Perhaps we should also include global/file/namespace scoped functions.
 */
export default class PhpUnitProxy
{
    /**
     * Initializes the instance
     *
     * @constructor
     * @param {PhpUnitProjectManager} projectManager - The main project manager
     */
    constructor (projectManager) {
        this.projectManager = projectManager
        this.disposables = new CompositeDisposable()
        this.service = new PhpCoreService()

        this.observing = {}
        this.excluding = {}
        this.cache = null

        this.classRanges = new WeakMap()
        this.methodRanges = new WeakMap()
        this.classMapping = new WeakMap()
        this.methodMapping = new WeakMap()

        this.disposables.add(atom.workspace.observeTextEditors(this.observeTextEditor.bind(this)))
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
     * Returns the scope of the most recently added cursor
     *
     * @param  {TextEditor}        editor - The text editor to examine
     *
     * @return {PhpUnitScope|Null}        - The scope data or null if not found
     */
    getScopeForCursor (editor) {
        if (editor) {
            const point = editor.getCursorBufferPosition()

            point.row++

            const scope = this.getScopeForPoint(editor, point)

            if (!scope) {
                return this.displayFileError(editor.getPath())
            }

            return scope
        }
    }

    /**
     * Returns the scope of a mouse click
     *
     * @param  {TextEditor}        editor - The text editor to examine
     * @param  {MouseEvent}        event  - The mouse event
     *
     * @return {PhpUnitScope|Null}        - The scope data or null if not found
     */
    getScopeForEvent (editor, event) {
        if (this.cache && this.cache.event === event) {
            return this.cache.scope
        }

        if (!editor || !event || !editor.getElement().contains(event.target)) {
            return null
        }

        const {component} = atom.views.getView(editor)
        const position = component.screenPositionForMouseEvent(event)

        position.row = editor.bufferRowForScreenRow(position.row) + 1

        const scope = this.getScopeForPoint(editor, position)

        this.cache = {
            event,
            scope
        }

        return scope
    }

    /**
     * Returns the scope of a file position
     *
     * @param  {TextEditor}        editor - The text editor to examine
     * @param  {Point}             point  - The editor buffer position
     *
     * @return {PhpUnitScope|Null}        - The scope data or null if not found
     */
    getScopeForPoint (editor, point) {
        const project = this.projectManager.getProjectForEditor(editor)

        if (!project || !editor || !point) {
            return null
        }

        if (this.classRanges.has(editor)) {
            let mappedClass,
                mappedMethod

            for (const classRange of this.classRanges.get(editor)) {
                if (classRange.containsPoint(point)) {
                    mappedClass = this.classMapping.get(classRange)
                    break
                }
            }

            if (mappedClass && this.methodRanges.has(editor)) {
                for (const methodRange of this.methodRanges.get(editor)) {
                    if (methodRange.containsPoint(point)) {
                        mappedMethod = this.methodMapping.get(methodRange)
                        break
                    }
                }
            }

            if (mappedClass) {
                return new PhpUnitScope(project, mappedClass, mappedMethod)
            }
        }

        return null
    }

    /**
     * Finds the available class scopes within a file
     *
     * @param  {String}  file - The full path of a file to query
     *
     * @return {Promise<Array<PhpUnitScope>>}
     */
    async getClassScopesForFile (file) {
        const project = this.projectManager.getProject(file)

        if (!project) {
            return null
        }

        const classInfos = await this.service.getClassInfosForFile(file)

        if (classInfos) {
            return classInfos.map((info) => new PhpUnitScope(project, info))
        }

        return this.displayFileError(file)
    }

    /**
     * Finds all method scopes for a class
     *
     * @param  {String}  className - The fully qualified class name to query
     *
     * @return {Promise<Array<PhpUnitScope>>}
     */
    async getScopeForClass (path, className) {
        const classInfo = await this.service.getClassInfo(path, className)

        if (classInfo) {
            const project = this.projectManager.getProject(classInfo.getPath())

            if (project) {
                return new PhpUnitScope(project, classInfo)
            }
        }

        return this.displayFileError(path)
    }

    /**
     * Finds the scope of a method within a class
     *
     * @param  {String}  className  - The fully qualified class name to query
     * @param  {String}  methodName - The name of a method within the class
     *
     * @return {Promise<PhpUnitScope>}
     */
    async getScopeForMethod (path, className, methodName) {
        const classInfo = await this.service.getClassInfo(path, className)

        if (classInfo) {
            const project = this.projectManager.getProject(classInfo.filename)
            const methodInfo = classInfo.getMethod(methodName)

            if (project && methodInfo) {
                return new PhpUnitScope(project, classInfo, methodInfo)
            }
        }

        return this.displayFileError(path)
    }

    /**
     * Checks a scope has been configured correctly
     *
     * If a simple object is given, it will be converted to an a scope instance.
     * Class and method ranges will be removed, if the indicated classes/files/methods
     * don't exist.
     *
     * @param  {Object|PhpUnitScope}  scope - A scope or scope like object
     * @return {Promise}                    - Resolves with the validated scope
     * @throws                              - If name, namespace or path or not present
     */
    async validateScope (scope) {
        if (!(scope instanceof PhpUnitScope)) {
            throw new Error('validateScope: No Scope available')
        }

        scope.setClassRange(null)
        const classInfo = await this.service.getClassInfo(scope.getPath(), scope.getFullClassName())

        if (classInfo) {
            scope.setClassRange(classInfo.getRange())

            if (scope.hasMethod()) {
                const methodInfo = classInfo.getMethod(scope.getMethodName())

                scope.setMethodRange(methodInfo ? methodInfo.getRange() : null)
            }
        }

        if (!(scope instanceof PhpUnitScope)) {
            scope = new PhpUnitScope(scope.project, scope, scope.method)
        }

        return scope
    }

    /**
     * Finds and/or creates a test suite class
     *
     * @param  {PhpUnitScope}          source - The scope of the source file
     *
     * @return {Promise<PhpUnitScope>}        - Resolves when complete
     */
    async resolveTestClass (source) {
        source = source.clone(false)

        return this.resolveTarget(source)
    }

    /**
     * Finds and/or creates a test suite method
     *
     * @param  {PhpUnitScope}          source - The scope of the source file
     *
     * @return {Promise<PhpUnitScope>}        - Resolves when complete
     */
    async resolveTestMethod (source) {
        source = source.clone(true)

        return this.resolveTarget(source)
    }

    /**
     * Converts a source scope into a target scope
     *
     * @param  {PhpUnitScope}  source - The scope to convert
     *
     * @return {Promise<PhpUnitScope>}
     */
    async resolveTarget (source) {
        const project = source.getProject()
        const adapter = project.getAdapter()

        const target = await adapter.describe(source.clone())

        if (target) {
            return await this.validateScope(target)
        }

        return null
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
        return null != this.projectManager.getProjectForEditor(editor)
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
        const disposables = new CompositeDisposable()

        disposables.add(editor.onDidStopChanging(() => {
            this.service.reindex(editor.getPath(), editor.getText()).then(() => {
                this.createRangesForEditor(editor)
            })
        }))

        disposables.add(editor.onDidDestroy(() => {
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

            disposables.dispose()
        }))

        // NOTE It's possible for multiple editors to be open for the same path
        if (!this.observing[path]) {
            this.observing[path] = [editor]
        } else {
            this.observing[path].push(editor)
        }

        // TODO Tie to the path not the editor
        // TODO If path is a common file, attempt to also range the test file
        this.createRangesForEditor(editor)
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

        const classInfos = await this.service.getClassInfosForFile(path, editor.getText())

        if (classInfos) {
            const classRanges = []
            const methodRanges = []

            for (const classInfo of classInfos) {
                const classRange = classInfo.getRange()

                classRanges.push(classRange)
                this.classMapping.set(classRange, classInfo)

                // for (const methodInfo of Object.values(classInfo.methods)) {
                for (const methodInfo of classInfo.getMethods()) {
                    if (methodInfo.isPublic() && !methodInfo.isAbstract()) {
                        if ('__construct' !== methodInfo.getName()) {
                            const methodRange = methodInfo.getRange()

                            methodRanges.push(methodRange)
                            this.methodMapping.set(methodRange, methodInfo)
                        }
                    }
                }
            }

            this.classRanges.set(editor, classRanges)
            this.methodRanges.set(editor, methodRanges)
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
     * Displays an error notification for the parser error
     *
     * @param  {String} file - A file path with possible errors
     *
     * @return {Null}
     */
    displayFileError (file) {
        const error = this.service.getParseError(file)

        if (error) {
            atom.notifications.addError(`Error parsing file '${file}'`, {
                detail: error.message,
                dismissable: true
            })
        }

        return null
    }
}
