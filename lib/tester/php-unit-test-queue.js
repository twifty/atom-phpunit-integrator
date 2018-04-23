/** @babel */
/* global Symbol */

import CancelablePromise from '../util/cancelable-promise'

const popQueueItem = Symbol()

export default class PhpUnitTestQueue
{
    /**
     * Constructor
     *
     * @param {Function|Array<Function>} [factory] - A function which returns a Promise
     */
    constructor (factory = null) {
        this.deferred = {}
        this.finished = false
        this.queue = []
        this.total = 0
        this.progress = 0

        if (factory) {
            this.push(factory)
        }
    }

    /**
     * Appends a promise factory to the queue
     *
     * The factory function will be invoked when required and no sooner.
     *
     * @param {Function|Array<Function>} factory - A function which returns a promise
     */
    push (factory) {
        if (this.finished) {
            throw Error("The queue has already emptied.")
        }

        if (Array.isArray(factory)) {
            this.queue = this.queue.concat(factory)
            this.total += factory.length
        } else if (typeof factory === 'function') {
            this.queue.push(factory)
            this.total++
        } else {
            throw new Error(`Expected a Promise factory, got (${typeof factory})`)
        }
    }

    /**
     * Returns the total number of tests seen in the queue
     *
     * @return {Number}
     */
    totalItemCount () {
        return this.total
    }

    /**
     * Returns the number of completed tests
     *
     * @return {Number}
     */
    processedItemCount () {
        return this.progress
    }

    /**
     * Begins the execution of all promises in the queue
     *
     * @return {Promise} - Resolves when all current and future promises resolve
     */
    execute () {
        if (this.finished) {
            throw Error("The queue has already emptied.")
        }

        this.deferred.promise = new CancelablePromise((resolve, reject) => {
            this.deferred.resolve = resolve
            this.deferred.reject = reject
            this[popQueueItem]()
        }, () => {
            this.cancel()
        })

        return this.deferred.promise
    }

    /**
     * Invokes the currently running promises cancel handler and clears all pending promises
     */
    cancel () {
        if (!this.finished && this.current) {
            this.queue = []
            this.finished = true

            if (typeof this.current.cancel === 'function') {
                this.current.cancel()
            }
        }
    }

    /**
     * Appends optional resolve and reject handlers
     *
     * @param  {Function} [onResolve] - Invoked when the promise resolves with the resolved value
     * @param  {Function} [onReject]  - Invoked when the promise reject with the reject reason
     *
     * @return {Promise}              - Allows for promise chaining
     */
    then (onResolve, onReject) {
        return this.deferred.promise.then(onResolve, onReject)
    }

    /**
     * Appends a reject handler
     *
     * @param  {Function} onReject - Invoked when the promise reject with the reject reason
     *
     * @return {Promise}           - Allows for promise chaining
     */
    catch (onReject) {
        return this.deferred.promise.catch(onReject)
    }

    /**
     * Appends a finally handler
     *
     * NOTE: supported in chrome v63 and up, atom v1.25 still uses chrome v59
     *
     * @param  {Function} onReject - Invoked regardless of if the promise resolves or rejects
     *
     * @return {Promise}           - Allows for promise chaining
     */
    finally (onFinally) {
        return this.deferred.promise.finally(onFinally)
    }

    /**
     * Pops a single queue item then waits until the promise resolves or rejects
     *
     * @private
     */
    [popQueueItem] () {
        if (this.queue.length) {
            const factory = this.queue.shift()
            this.current = factory()
            this.current.then(() => {
                this.progress++
                if (this.queue.length === 0) {
                    this.finished = true
                    this.deferred.resolve()
                }
                this[popQueueItem]()
            }, (error) => {
                this.finished = true
                this.deferred.reject(error)
            })
        }
    }
}
