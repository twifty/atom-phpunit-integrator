/** @babel */
/* global require atom */

import Path from 'path'
import compare_versions from 'compare-versions'
import { waitForCondition } from '../util/php-unit-utils'

const versionMessage = "'php-unit-integrator' requires 'php-integrator-base' with a minimum version of '3.2.0'."

/**
 * The integrator base service will be dropped in version 4. This is a workaround.
 */
export default class IntegratorService
{
  /**
   * Constructor
   *
   * @constructor
   * @param {String} packagePath - The full path to the integrator-base package
   */
  constructor (packagePath) {
    this.source = packagePath
    this.proxy = null
    this.indexingMediator = null
    this.projectManager = null

    this.isActivated = false
  }

  /**
   * Loads the requires parts of the integrator-base package
   *
   * @return {Promise} - Will resolve when the database is ready
   */
  activate () {
    const plugin = require(Path.join(this.source, 'lib', 'Main.coffee'))

    if (!plugin.coreVersionSpecification) {
      atom.notifications.addError("Failed to detect package version of 'php-integrator-base'!", {
        detail: versionMessage
      })
      throw Error('Invalid Version')
    } else if (1 === compare_versions('3.2.0', plugin.coreVersionSpecification)) {
      atom.notifications.addWarning("PHPUnit code generation has been disabled.", {
        detail: versionMessage
      })
      throw Error('Version Not Satisfied')
    }

    // return plugin.activate().then(() => {
      this.proxy = plugin.getProxy()
      this.indexingMediator = plugin.getIndexingMediator()
      this.projectManager = plugin.getProjectManager()

      // The plugin is not active until the proxy has been configured with
      // a database name. There is no event/promise to indicate when done.

      const isServiceInitialized = this.proxy.getIndexDatabasePath.bind(this.proxy)

      return waitForCondition(isServiceInitialized, 60).then(() => {
        this.isActivated = true
      }).catch(error => {
        if ('timed out' === error) {
          throw new Error("Timed out waiting for php-integrator ready state")
        }

        throw error
      })
    // })
  }

  /**
   * Returns the classnames and basic info about classes in a file
   *
   * @param  {String} file - The full path to the file
   *
   * @return {Promise<Object>}
   */
  getClassListForFile (file) {
    return this.proxy.getClassListForFile(file)
  }

  /**
   * Returns detailed information about a PHP class
   *
   * @param  {String} className - The fully qualified class name
   *
   * @return {Promise<Object>}
   */
  getClassInfo (className) {
    return this.proxy.getClassInfo(className)
  }

  /**
   * Updates the database after changes to a file
   *
   * @param  {String} path   - The full path to the file
   * @param  {String} source - The file contents
   *
   * @return {Promise}       - Resolves with nothing
   */
  reindex (path, source) {
    // return this.indexingMediator.reindex(path, source, excludedPaths, fileExtensionsToIndex)
    return this.projectManager.attemptCurrentProjectFileIndex(path, source)
  }

  /**
   * Registers for notifactions of file changes
   *
   * @param  {Function} callback - The handler
   *
   * @return {Disposable}
   */
  onDidFinishIndexing (callback) {
    return this.indexingMediator.onDidFinishIndexing(callback)
  }
}
