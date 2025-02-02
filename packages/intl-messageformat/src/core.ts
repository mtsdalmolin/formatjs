/*
Copyright (c) 2014, Yahoo! Inc. All rights reserved.
Copyrights licensed under the New BSD License.
See the accompanying LICENSE file for terms.
*/

import {parse, MessageFormatElement} from '@formatjs/icu-messageformat-parser'
import * as memoize from 'fast-memoize'
import {Cache} from 'fast-memoize'
import {
  FormatterCache,
  Formatters,
  Formats,
  formatToParts,
  FormatXMLElementFn,
  PrimitiveType,
  MessageFormatPart,
  PART_TYPE,
} from './formatters'

// -- MessageFormat --------------------------------------------------------

function mergeConfig(c1: Record<string, object>, c2?: Record<string, object>) {
  if (!c2) {
    return c1
  }
  return {
    ...(c1 || {}),
    ...(c2 || {}),
    ...Object.keys(c1).reduce((all: Record<string, object>, k) => {
      all[k] = {
        ...c1[k],
        ...(c2[k] || {}),
      }
      return all
    }, {}),
  }
}

function mergeConfigs(
  defaultConfig: Formats,
  configs?: Partial<Formats>
): Formats {
  if (!configs) {
    return defaultConfig
  }

  return (Object.keys(defaultConfig) as Array<keyof Formats>).reduce(
    (all: Formats, k: keyof Formats) => {
      all[k] = mergeConfig(defaultConfig[k], configs[k])
      return all
    },
    {...defaultConfig}
  )
}

export interface Options {
  formatters?: Formatters
  /**
   * Whether to treat HTML/XML tags as string literal
   * instead of parsing them as tag token.
   * When this is false we only allow simple tags without
   * any attributes
   */
  ignoreTag?: boolean
}

function createFastMemoizeCache<V>(store: Record<string, V>): Cache<string, V> {
  return {
    create() {
      return {
        has(key) {
          return key in store
        },
        get(key) {
          return store[key]
        },
        set(key, value) {
          store[key] = value
        },
      }
    },
  }
}

// @ts-ignore this is to deal with rollup's default import shenanigans
const _memoizeIntl = memoize.default || memoize
const memoizeIntl = _memoizeIntl as typeof memoize.default

function createDefaultFormatters(
  cache: FormatterCache = {
    number: {},
    dateTime: {},
    pluralRules: {},
  }
): Formatters {
  return {
    getNumberFormat: memoizeIntl((...args) => new Intl.NumberFormat(...args), {
      cache: createFastMemoizeCache(cache.number),
      strategy: memoizeIntl.strategies.variadic,
    }),
    getDateTimeFormat: memoizeIntl(
      (...args) => new Intl.DateTimeFormat(...args),
      {
        cache: createFastMemoizeCache(cache.dateTime),
        strategy: memoizeIntl.strategies.variadic,
      }
    ),
    getPluralRules: memoizeIntl((...args) => new Intl.PluralRules(...args), {
      cache: createFastMemoizeCache(cache.pluralRules),
      strategy: memoizeIntl.strategies.variadic,
    }),
  }
}

export class IntlMessageFormat {
  private readonly ast: MessageFormatElement[]
  private readonly locales: string | string[]
  private readonly formatters: Formatters
  private readonly formats: Formats
  private readonly message: string | undefined
  private readonly formatterCache: FormatterCache = {
    number: {},
    dateTime: {},
    pluralRules: {},
  }
  constructor(
    message: string | MessageFormatElement[],
    locales: string | string[] = IntlMessageFormat.defaultLocale,
    overrideFormats?: Partial<Formats>,
    opts?: Options
  ) {
    if (typeof message === 'string') {
      this.message = message
      if (!IntlMessageFormat.__parse) {
        throw new TypeError(
          'IntlMessageFormat.__parse must be set to process `message` of type `string`'
        )
      }
      // Parse string messages into an AST.
      this.ast = IntlMessageFormat.__parse(message, {
        ignoreTag: opts?.ignoreTag,
      })
    } else {
      this.ast = message
    }

    if (!Array.isArray(this.ast)) {
      throw new TypeError('A message must be provided as a String or AST.')
    }

    // Creates a new object with the specified `formats` merged with the default
    // formats.
    this.formats = mergeConfigs(IntlMessageFormat.formats, overrideFormats)

    // Defined first because it's used to build the format pattern.
    this.locales = locales

    this.formatters =
      (opts && opts.formatters) || createDefaultFormatters(this.formatterCache)
  }

  format = <T = void>(
    values?: Record<string, PrimitiveType | T | FormatXMLElementFn<T>>
  ) => {
    const parts = this.formatToParts(values)
    // Hot path for straight simple msg translations
    if (parts.length === 1) {
      return parts[0].value
    }
    const result = parts.reduce((all, part) => {
      if (
        !all.length ||
        part.type !== PART_TYPE.literal ||
        typeof all[all.length - 1] !== 'string'
      ) {
        all.push(part.value)
      } else {
        all[all.length - 1] += part.value
      }
      return all
    }, [] as Array<string | T>)

    if (result.length <= 1) {
      return result[0] || ''
    }
    return result
  }
  formatToParts = <T>(
    values?: Record<string, PrimitiveType | T | FormatXMLElementFn<T>>
  ): MessageFormatPart<T>[] =>
    formatToParts(
      this.ast,
      this.locales,
      this.formatters,
      this.formats,
      values,
      undefined,
      this.message
    )
  resolvedOptions = () => ({
    locale: Intl.NumberFormat.supportedLocalesOf(this.locales)[0],
  })
  getAst = () => this.ast
  private static memoizedDefaultLocale: string | null = null

  static get defaultLocale() {
    if (!IntlMessageFormat.memoizedDefaultLocale) {
      IntlMessageFormat.memoizedDefaultLocale = new Intl.NumberFormat().resolvedOptions().locale
    }

    return IntlMessageFormat.memoizedDefaultLocale
  }
  static __parse: typeof parse | undefined = parse
  // Default format options used as the prototype of the `formats` provided to the
  // constructor. These are used when constructing the internal Intl.NumberFormat
  // and Intl.DateTimeFormat instances.
  static formats: Formats = {
    number: {
      currency: {
        style: 'currency',
      },

      percent: {
        style: 'percent',
      },
    },

    date: {
      short: {
        month: 'numeric',
        day: 'numeric',
        year: '2-digit',
      },

      medium: {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      },

      long: {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      },

      full: {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      },
    },

    time: {
      short: {
        hour: 'numeric',
        minute: 'numeric',
      },

      medium: {
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      },

      long: {
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        timeZoneName: 'short',
      },

      full: {
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        timeZoneName: 'short',
      },
    },
  }
}
