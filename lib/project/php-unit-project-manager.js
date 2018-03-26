/** @babel */
/* global atom */

import {CompositeDisposable, Emitter} from 'atom'

import PhpUnitProject from './php-unit-project'

export default class PhpUnitProjectManager
{
    constructor (options) {
      this.emitter = new Emitter()
      this.disposables = new CompositeDisposable()
      this.options = options || {}
      this.projects = {}

      this.disposables.add(atom.project.onDidChangePaths(projectPaths => {
        this.updateProjects(projectPaths)
      }))

      this.updateProjects(atom.project.getPaths())
    }

    destroy () {
      this.emitter.off()
      this.updateProjects([])
      this.disposables.dispose()
    }

    onDidProjectsChange (cb) {
      this.emitter.on('projects-changed', cb)
    }

    onDidProjectConfigChange (cb) {
      this.emitter.on('project-config-changed', cb)
    }

    getProjects () {
      return Object.values(this.projects)
    }

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

    updateProjects (projectPaths) {
      const options = Object.assign({}, this.options, {
        emitter: this.emitter
      })

      let removable = Object.keys(this.projects)
      let refresh = false

      projectPaths.forEach(path => {
        const index = removable.indexOf(path)

        if (index < 0) {
          this.projects[path] = new PhpUnitProject(path, options)
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
