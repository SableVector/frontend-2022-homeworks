/*
  This script requires https://github.com/cli/cli installed globally
 */
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const writeFile = promisify(require('fs').writeFile);

console.log("This script requires https://github.com/cli/cli installed\n");

const baseRepoUrl = "https://github.com/kottans/frontend-2021-homeworks/";

const prLabels = [
  "Hooli-style Popup",
  "JS DOM",
  "JS pre-OOP",
  "JS OOP",
  "JS post-OOP",
  "Memory Pair Game",
  "Friends App",
];

const prStates = [
  "open",
  "merged",
];

const url = {
  prListFilteredByAuthorPrefix: baseRepoUrl + "pulls?q=is%3Apr+author%3A",
  prPrefix: baseRepoUrl + "pull/",
  issuePrefix: baseRepoUrl + "issues/",
}

const statsFileName = "./pr-stats.md";

main();

async function main() {
  let prDataByAuthor, issueDataByAuthor;
  try {
    prDataByAuthor = await collectPullRequestData();
  } catch (e) {
    console.error('Failed to collect PR data', e);
    return;
  }
  try {
    issueDataByAuthor = await collectIssueData(Object.keys(prDataByAuthor));
  } catch (e) {
    console.error('Failed to collect issue data', e);
    return;
  }
  Object.keys(issueDataByAuthor)
    .forEach(authorName => {
      prDataByAuthor[authorName] = {
        ...issueDataByAuthor[authorName],
        ...prDataByAuthor[authorName],
      };
    });
  const orderedAuthors = Object.keys(prDataByAuthor)
    .map(authorName => ({
      author: authorName,
      prs: Object.keys(prDataByAuthor[authorName]).length,
    }))
    .sort((a,b) => {
      if (a.prs === b.prs) {
        if (a.author.toLowerCase() < b.author.toLowerCase()) return -1;
        return 1;
      }
      return b.prs - a.prs;
    }).map(authorStats => authorStats.author);
  const table = "Open and merged PRs by task labels\n\n" +
    `_as of ${new Date().toISOString()} UTC_\n\n` +
    makeMDtable(orderedAuthors, prLabels, prDataByAuthor);
  const ioResult = await saveStatsToAFile(statsFileName, table);
  console.log(`Saving stats ${statsFileName}: ${ioResult}`);
}

async function saveStatsToAFile(fileName, text) {
  try {
    await writeFile(fileName, text);
    return 'Success';
  } catch (err) {
    console.error(`Error writing data to "${fileName}"`);
    return 'Failure';
  }
}

function makeMDtable(authors, labels, dataByAuthor) {
  const columnDelimiter = " | ";
  const rows = [];
  let coveredTasksCountLatest = Number.MAX_SAFE_INTEGER;
  rows.push('author' + columnDelimiter + labels.join(columnDelimiter));
  rows.push("--- | ".repeat(labels.length) + "---");
  authors.forEach(authorName => {
    const coveredTasksCount = Object.keys(dataByAuthor[authorName]).length;
    if (coveredTasksCount < coveredTasksCountLatest) {
      rows.push(`**${coveredTasksCount} task(s)**` + columnDelimiter.repeat(labels.length));
      coveredTasksCountLatest = coveredTasksCount;
    }
    rows.push([
      makePrListUrl(authorName),
      ...labels.map(label =>
        dataByAuthor[authorName][label]
          ? makePrUrl(dataByAuthor[authorName][label].prn, dataByAuthor[authorName][label].state[0])
          : " "
      )].join(columnDelimiter)
    );
  });
  return rows.join("\n")+"\n";
}

function makePrListUrl(authorName) {
  return `[${authorName}](${url.prListFilteredByAuthorPrefix + authorName})`;
}

function makePrUrl(prn, state) {
  let anchorText =
    (state === 'm' ? "**" : "") +
    `#${prn}` +
    (state === 'm' ? "**" : ` ${state}`);
  return `[${anchorText}](${url.prPrefix}${prn})`;
}

async function collectPullRequestData() {
  const dataByAuthor = {};
  await Promise.all(
    prLabels.map(async (label) => {
      await Promise.all(
        prStates.map(async (state) => {
          const command = fetchPrListGhCommand(label, state);
          try {
            const data = await exec(command);
            const prs = parsePrsData(data.stdout);
            prs.forEach(({prn, author}) => {
              if (!dataByAuthor[author]) dataByAuthor[author] = {};
              dataByAuthor[author][label] = {
                prn,
                state,
              };
            });
          } catch(e) {
            console.error(`ERROR executing "${command}"`);
            throw new Error(e);
          }
        })
      )
    })
  );
  return dataByAuthor;
}

async function collectIssueData(authors) {
  const dataByAuthor = {};
  await Promise.all(
    prLabels.map(async (label) => {
      await Promise.all(
        authors.map(async (author) => {
          const command = fetchIssueListGhCommand(author, label);
          try {
            const data = await exec(command);
            if (data.stdout.length) {
              const issues = parseIssuesData(data.stdout);
              issues.forEach(({issuen}) => {
                if (!dataByAuthor[author]) dataByAuthor[author] = {};
                dataByAuthor[author][label] = {
                  prn: issuen,
                  state: "issue",
                };
              });
            }
          } catch(e) {
            console.error(`ERROR executing "${command}"`);
            throw new Error(e);
          }
          console.log(`Gathering issues for ${author}/${label}`);
        })
      )
    })
  );
  return dataByAuthor;
}

function parsePrsData(data) {
  const result = [];
  const matches = data.matchAll(/^(?<prn>\d+)\t.+\t(?<author>.+):.*$/mg);
  for (const match of matches) {
    result.push(match.groups);
  }
  return result;
}

function parseIssuesData(data) {
  const result = [];
  const matches = data.matchAll(/^(?<issuen>\d+).+$/mg);
  for (const match of matches) {
    result.push(match.groups);
  }
  return result;
}

function fetchPrListGhCommand(label, state) {
  return `gh pr list --state ${state} --label "${label}" --limit 200`;
}

function fetchIssueListGhCommand(author, label) {
  return `gh issue list --author "${author}" --state all --label "${label}" --limit 200`;
}
