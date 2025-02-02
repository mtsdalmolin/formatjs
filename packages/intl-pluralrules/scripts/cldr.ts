import {join, basename} from 'path'
import {outputFileSync, readFileSync} from 'fs-extra'
import minimist from 'minimist'
import {sync as globSync} from 'fast-glob'

function main(args: minimist.ParsedArgs) {
  const {cldrFolder, locales: localesToGen = '', outDir} = args
  const allFiles = globSync(join(cldrFolder, '*.js'))
  allFiles.sort()
  const locales = localesToGen
    ? localesToGen.split(',')
    : allFiles.map(f => basename(f, '.js'))

  // Dist all locale files to locale-data (JS)
  for (const locale of locales) {
    const data = readFileSync(join(cldrFolder, `${locale}.js`))
    const destFile = join(outDir, locale + '.js')
    outputFileSync(
      destFile,
      `/* @generated */
// prettier-ignore
if (Intl.PluralRules && typeof Intl.PluralRules.__addLocaleData === 'function') {
  Intl.PluralRules.__addLocaleData(${data})
}
`
    )
  }
}
if (require.main === module) {
  main(minimist(process.argv))
}
