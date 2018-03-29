/** @babel */
/* global atom */

import {CompositeDisposable, Emitter} from 'atom'

import PhpUnitProject from './php-unit-project'

/**
 * Multiple Project collection
 */
export default class PhpUnitProjectManager
{
   /**
   * Initializes the instance
   *
   * @constructor
   * @param {PhpUnitConfig} config - Configuration to be passed onto Project constructors
   */
    constructor (config) {
      this.emitter = new Emitter()
      this.disposables = new CompositeDisposable()
      this.config = config
      this.projects = {}

      this.config.set('project-emitter', this.emitter)

      this.disposables.add(atom.project.onDidChangePaths(projectPaths => {
        this.updateProjects(projectPaths)
      }))

      this.updateProjects(atom.project.getPaths())
    }

    /**
     * Destroys the instance
     */
    destroy () {
      this.emitter.off()
      this.updateProjects([])
      this.disposables.dispose()
    }

    /**
     * Listens for new/removed projects
     *
     * @param  {Function}   cb - The listener handler
     *
     * @return {Disposable}
     */
    onDidProjectsChange (cb) {
      return this.emitter.on('projects-changed', cb)
    }

    /**
     * Listens for a Project configuration change
     *
     * @param  {Function}   cb - The listener handler
     *
     * @return {Disposable}
     */
    onDidProjectConfigChange (cb) {
      return this.emitter.on('project-config-changed', cb)
    }

    /**
     * Returns all open projects
     *
     * @return {Array<PhpUnitProject>}
     */
    getProjects () {
      return Object.values(this.projects)
    }

    /**
     * Returns the project with the given root directory
     *
     * @param  {String} path - The root directory of the project
     *
     * @return {PhpUnitProject}
     */
    getProject (path) {
      if (path) {
        if (this.projects[path]) {
          return this.projects[path]
        }

        const dirs = atom.project.getDirectories()

        for (let i = 0; i < dirs.length; i++) {
          const dir = dirs[i]

          if (dir.contains(path)) {
            path = dir.getPath()

            if (this.projects[path]) {
              return this.projects[path]
            }

            break
          }
        }
      }
    }

    /**
     * Synchronizes the local projects with currently opened projects
     *
     * @private
     * @param  {Array<String>} projectPaths - Root directories of all open projects
     */
    updateProjects (projectPaths) {
      // const options = Object.assign({}, this.options, {
      //   emitter: this.emitter
      // })

      let removable = Object.keys(this.projects)
      let refresh = false

      projectPaths.forEach(path => {
        const index = removable.indexOf(path)

        if (index < 0) {
          this.projects[path] = new PhpUnitProject(path, this.config)
          refresh = true
        } else {
          removable.splice(index, 1)
        }
      })

      removable.forEach(path => {
        this.projects[path].destroy()
        delete this.projects[path]
        refresh = true
      })

      if (refresh) {
        this.emitter.emit('projects-changed', Object.values(this.projects))
      }
    }

}
