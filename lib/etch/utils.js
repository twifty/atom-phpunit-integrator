/** @babel */
/* global Symbol console */

export function getType (data) {
  return Object.prototype.toString
    .call(data)
    .toLowerCase()
    .slice(8, -1)
}

export function clone (data) {
  const type = getType(data)
  switch (type) {
    case 'boolean':
    case 'null':
    case 'undefined':
    case 'number':
    case 'string':
    case 'function':
      return data
    case 'map':
    case 'weakmap':
    case 'set':
    case 'date':
      return new data.constructor(...data)
    case 'array':
      return data.map(value => {
        return clone(value)
      })
    case 'object':
      if ('Object' === data.constructor.name) {
        const result = {}
        for (const key in data) {
          result[key] = clone(data[key])
        }
        return result
      }
      for (const method of ['clone', 'cloneNode']) {
        if (data[method] && typeof data[method] === 'function') {
          return data[method].call(data[method])
        }
      }
      // An instantiated object
      return data
    default:
      console.log(`Trying to clone unrecognized type '${type}' with constructor '${data.constructor}'`)
      return data
  }
}

export function makeObjectIterable (data) {
  if (null == data) {
    data = {}
  }
  
  if (!data[Symbol.iterator]) {
    data[Symbol.iterator] = function* () {
      for (let key of Object.keys(data)) {
        yield data[key]
      }
    }
  }

  return data
}

export function *splitStrings(data) {
  if (Array.isArray(data)) {
    for (const item of data) {
      yield *splitStrings(item)
    }
  } else {
    data = data.split(/\s+/)

    for (const item of data) {
      if (item) {
        yield item
      }
    }
  }
}

export function camelCase (str) {
  return str.replace(/-([a-z])/g, (g) => {
    return g[1].toUpperCase()
  })
}

export function toArray (...values) {
  let a = []

  for (let i = 0; i < values.length; i++) {
    const value = values[i]

    if (value) {
      if (!Array.isArray(value)) {
        a = a.concat(value.split(' '))
      } else {
        a = a.concat(value)
      }
    }
  }

  return a
}
