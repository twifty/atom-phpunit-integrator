/** @babel */
/* global Promise Symbol */

const popQueueItem = Symbol()

export default class PhpUnitTestQueue
{
	/**
	 * Constructor
	 *
	 * @param {Function} [factory] - A function which returns a Promise
	 */
	constructor (factory = null) {
		this.deferred = {}
		this.finished = false
		this.queue = Array.isArray(factory) ? factory.slice(0) : [factory]

		if (Array.isArray(factory)) {
			this.queue = factory.slice(0)
		} else if (typeof factory === 'function') {
			this.queue = [factory]
		} else if (null != factory) {
			throw new Error(`Expected a Promise factory, got (${typeof factory})`)
		} else {
			this.queue = []
		}

	}

	/**
	 * Appends a promise factory to the queue
	 *
	 * The factory function will be invoked when required and no sooner.
	 *
	 * @param {Function} factory - A function which returns a promise
	 */
	push (factory) {
		if (this.finished) {
			throw Error("The queue has already emptied.")
		}

		if (Array.isArray(factory)) {
			this.queue = this.queue.concat(factory)
		} else if (typeof factory === 'function') {
			this.queue.push(factory)
		} else {
			throw new Error(`Expected a Promise factory, got (${typeof factory})`)
		}
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

		this.deferred.promise = new Promise((resolve, reject) => {
			this.deferred.resolve = resolve
			this.deferred.reject = reject
			this[popQueueItem]()
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
