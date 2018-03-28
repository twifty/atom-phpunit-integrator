/** @babel */
/* global Promise Symbol */

const run = Symbol()

/**
 * Unused. I've left this here for the upcoming service change
 */
export default class OneForAllPromise {
  constructor (promise) {
    this.deferred = {}
    this.queue = [promise]
    this.finished = false

    this.deferred.promise = new Promise((resolve, reject) => {
      this.deferred.resolve = resolve
      this.deferred.reject = reject
      this[run]()
    })
  }

  add (promise) {
    if (this.finished) {
      throw Error("The queue has already emptied.")
    }

    this.queue.push(promise)

    if (this.current && typeof this.current.cancel === 'function') {
      this.current.cancel()
    }
  }

  then (resolveHandler, rejectHandler) {
    return this.deferred.promise.then(resolveHandler, rejectHandler)
  }

  finally (onFinally) {
    return this.deferred.promise.finally(onFinally)
  }

  [run] () {
    if (this.queue.length) {
      this.current = this.queue.shift()

      this.current.then((result) => {
        if (this.queue.length === 0) {
          this.finished = true
          this.deferred.resolve(result)
        }
        this[run]()
      }, (error) => {
        this.finished = true
        this.deferred.reject(error)
      })
    }
  }
}
