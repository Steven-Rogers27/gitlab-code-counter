import axios from 'axios'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = fileURLToPath(new URL('.', import.meta.url)) 

const gitlabUrl = 'http://192.168.100.90:8088/api/v4'
const privateToken = 'ecjXt8KbyVNg9MBfJP2n' // codeAnalyze token
const distDir = path.resolve(__dirname, '../dist') 

const http = axios.create({
  headers: {
    'PRIVATE-TOKEN': privateToken,
  },
})

function findUserByName(name) {
  return new Promise(resolve => {
    http.request({
      url: gitlabUrl + '/users',
      method: 'get',
      params: {
        search: name,
      },
    }).then(res => {
      resolve(res.data)
    })
  })
}

/**
 * 这个接口404
 * @param {number} userId 
 * @returns 
 */
function getProjectsUserContributedTo(userId) {
  return new Promise((resolve, reject) => {
    http.request({
      url: gitlabUrl + `/users/${userId}/contributed_projects`,
      method: 'get',
    }).then(res => {
      resolve(res)
    }, err => {
      reject(err)
    })
  })
}

function getAllProjects() {
  return new Promise(resolve => {
    http.request({
      url: gitlabUrl + '/projects',
      method: 'get',
      params: {
        'updated_after': '2023-07-01T00:00:00Z', 
        'per_page': 50000
      },
    }).then(res => {
      resolve(res.data)
    })
  })
}

function getCommitsOfProject(id, refName) {
  return new Promise(resolve => {
    http.request({
      url: gitlabUrl + `/projects/${id}/repository/commits`,
      method: 'get',
      params: {
        since: '2023-07-01T00:00:00Z',
        'ref_name': refName,
        'per_page': 50000
      },
    }).then(res => {
      resolve(res.data)
    })
  })
}

function getBranchesOfProject(id) {
  return new Promise(resolve => {
    http.request({
      url: gitlabUrl + `/projects/${id}/repository/branches`,
      method: 'get',
      params: {
        'per_page': 50000
      },
    }).then(res => {
      resolve(res.data)
    })
  })
}

function getCommitInfo(projectId, commitId) {
  return new Promise(resolve => {
    http.request({
      url: gitlabUrl + `/projects/${projectId}/repository/commits/${commitId}`,
      method: 'get',
      params: {
        'per_page': 50000
      },
    }).then(res => {
      resolve(res.data)
    })
  })
}

function exec() {
  getAllProjects()
    .then(res => {
      const result = res.filter(p => {
        return [
          'laowufbs-app',
          // 'crcc-frontend-workspace',
          // 'security-app',
          // 'jingguan-app',
          // 'laowu-app',
        ].includes(p.name)
      })
      const resultCount = {}
      result.forEach(p => {
        getBranchesOfProject(p.id)
          .then(res => {
            const branchNames = res.map(b => b.name)
            const apis = branchNames.map(b => {
              return getCommitsOfProject(p.id, b)
            })
            Promise.all(apis)
              .then(res => {
                const combine = res.reduce((acc, cur) => {
                  acc.push(...cur)
                  return acc
                }, [])
                fs.writeFile(path.resolve(__dirname, `../dist/${p.name}-commits.json`), JSON.stringify(combine, null, '\t'), (err) => { })
                const commitIds = combine.map(c => c.id)
                const apis = commitIds.map(c => {
                  return getCommitInfo(p.id, c)
                })
                Promise.all(apis)
                  .then(res => {
                    fs.writeFile(path.resolve(__dirname, `../dist/${p.name}-commit-info.json`), JSON.stringify(res.filter(i => i['author_name'] === '李 兵兵'), null, '\t'), (err) => {})
                    const map = new Map()
                    res.forEach(item => {
                      if (map.has(item['author_name'])) {
                        const set = map.get(item['author_name'])
                        set.add(item)
                      } else {
                        map.set(item['author_name'], new Set([item]))
                      }
                    })

                    resultCount[p.name] = {}
                    for (const [k, s] of map) {
                      const count = {
                        additions: 0,
                        deletions: 0,
                        total: 0,
                      }
                      s.forEach(item => {
                        const stats = item.stats
                        count.additions += stats.additions
                        count.deletions += stats.deletions
                        count.total += stats.total
                      })
                      fs.writeFile(path.resolve(__dirname, `../dist/${k}-stats.json`), JSON.stringify(count, null, '\t'), (err) => {})
                      resultCount[p.name][k] = count
                    }
                    fs.writeFile(path.resolve(__dirname, `../dist/所有人-stats.json`), JSON.stringify(resultCount, null, '\t'), (err) => {})
                  })
              })
          })
      })

    })
}

function main() {
  fs.stat(distDir, (err, stats) => {
    if (err) {
      fs.mkdir(path.resolve(__dirname, '../dist'), (err) => {
        if (err) return
        exec()
      })
      return
    }
    if (stats.isDirectory()) {
      fs.rm(distDir, { recursive: true, force: true }, (err) => {
        if (err) return
        fs.mkdir(distDir, (err) => {
          if (err) return
          exec()
        })
      })
    } else {
      fs.mkdir(path.resolve(__dirname, '../dist'), (err) => {
        if (err) return
        exec()
      })
    }
  })
}

main()