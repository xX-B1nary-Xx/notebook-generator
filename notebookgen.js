const fs = require('fs')
const path = require('path')
const spawn = require('child_process').spawn
const through2 = require('through2')
const tmp = require('tmp')

const section = ['\\section{', '\\subsection{', '\\subsubsection{']
const extensions = ['.cc', '.cpp', '.c', '.java', '.py', '.tex']

function walk (_path, depth) {
  let ans = ''
  depth = Math.min(depth, section.length - 1)
  fs.readdirSync(_path).forEach(function (file) {
    if (file.startsWith('.')) {
      return // hidden directory
    }
    var f = path.resolve(_path, file)
    var stat = fs.lstatSync(f)
    if (stat.isDirectory()) {
      ans += '\n' + section[depth] + file + '}\n' + walk(f, depth + 1)
    } else if (extensions.indexOf(path.extname(f)) !== -1) {
      ans += '\n' + section[depth] + file.split('.')[0] + '}\n'
      if (path.extname(f) !== '.tex') {
        ans += '\\begin{lstlisting}\n' + fs.readFileSync(f) + '\\end{lstlisting}\n'
      } else {
        ans += fs.readFileSync(f)
      }
    }
  })
  return ans
}

/**
 * pdf must be generated twice in order to generate the table of contents.
 * */
function genpdf (ans, texPath, tmpobj, iter) {
  var tex = spawn('pdflatex', [
    '-interaction=nonstopmode',
    texPath
  ], {
    cwd: tmpobj.name,
    env: process.env
  })

  tex.on('error', function (err) {
    console.error(err)
  })

  tex.on('exit', function (code, signal) {
    var outputFile = texPath.split('.')[0] + '.pdf'
    fs.exists(outputFile, function (exists) {
      if (exists) {
        if (iter === 1) {
          var s = fs.createReadStream(outputFile)
          s.pipe(ans)
          s.on('close', function () {
            tmpobj.removeCallback()
          })
        } else {
          genpdf(ans, texPath, tmpobj, iter + 1)
        }
      } else {
        console.error('Not generated ' + code + ' : ' + signal)
      }
    })
  })
}

function pdflatex (doc) {
  var tmpobj = tmp.dirSync({ unsafeCleanup: true })
  var texPath = path.join(tmpobj.name, '_notebook.tex')

  var ans = through2()
  ans.readable = true
  var input = fs.createWriteStream(texPath)
  input.end(doc)
  input.on('close', function () {
    genpdf(ans, texPath, tmpobj, 0)
  })

  return ans
}

module.exports = function (_path, output, author, initials) {
  var template = fs.readFileSync(path.join(__dirname, 'template_header.tex')).toString()
  template = template
    .replace('${author}', author)
    .replace('${initials}', initials)

  template += walk(_path, 0)
  template += '\\end{document}'
  output = output || './notebook.pdf'
  pdflatex(template).pipe(fs.createWriteStream(output))
}
