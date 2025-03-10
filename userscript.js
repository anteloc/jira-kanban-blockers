// ==UserScript==
// @name         Jira Issues Blockers
// @tag          jira
// @namespace    http://tampermonkey.net/
// @version      2025-03-09
// @description  Show a blockers dependencies between Jira Issues from a Kanban dashboard
// @author       anteloc
// @match        http*://*/secure/RapidBoard.jspa*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=tampermonkey.net
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @require      https://cdn.jsdelivr.net/npm/echarts@5.6.0/dist/echarts.min.js
// ==/UserScript==

(function () {
  "use strict";

  // Create menu item on Tampermonkey extension menu
  GM_registerMenuCommand("Jira - Blockers Chart", renderChartForCurrentBoard);
})();

/*
  Trigger Jira Blockers chart rendering
*/
function renderChartForCurrentBoard() {
  const url = new URL(window.location.href);
  const boardId = url.searchParams.get("rapidView");

  if (!boardId) {
    console.log(
      "Unable to get Jira Board ID from location URL: " + window.location.href
    );
    return;
  }

  console.log("Found Jira Board ID: " + boardId);

  // Retrieve Jira board value
  GM_xmlhttpRequest({
    method: "GET",
    url: `http://localhost:9090/rest/agile/1.0/board/${boardId}/issue?maxResults=1000&fields=issuetype,summary,description,issuelinks`,
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    },
    onload: function (response) {
      const json = JSON.parse(response.responseText);

      const graph = graphFromIssues(json.issues);
      addStatisticsToGraph(graph);

      const chartOption = buildChartOption(graph);
      // console.log(JSON.stringify(chartOption, null, 2));

      createChartContainer("#ghx-header", "blockers-chart");

      renderChart("blockers-chart", chartOption);
    },
  });
}

/*
  Render blocks dependencies chart
*/
function renderChart(containerId, chartOption) {
  let blocksChart = echarts.init(document.getElementById(containerId), null, {
    renderer: 'svg'
  });

  blocksChart.showLoading();
  blocksChart.setOption(chartOption, true);
  blocksChart.hideLoading();
}

function createChartContainer(parentId, containerId) {
  // Get the parent element for the chart container
  const parent = document.querySelector(parentId);

  if (!parent) {
    console.error(
      `Parent container for Jira Blockers chart not found, container with id: ${parentId}`
    );
    return;
  }

  const containerDiv = document.createElement("div");

  containerDiv.id = containerId;
  containerDiv.style.width = "800px";
  containerDiv.style.height = "300px";
  containerDiv.style.backgroundColor = "#f0f0f0";
  containerDiv.style.border = "1px solid #ccc";

  parent.appendChild(containerDiv);
}

/*
  Jira response processing
*/
function nodeFromIssue(issue) {
  const issueSummary = issue.fields.summary;
  const issueType = issue.fields.issuetype.name;

  return { issueId: issue.key, issueType, issueSummary };
}

function blocksFromIssue(issue) {
  return issue.fields.issuelinks
    .filter((l) => l.type.name === "Blocks")
    .map((l) => {
      const blockType = l.inwardIssue ? "blockedBy" : "blocks";
      const linkedIssue = l.inwardIssue || l.outwardIssue;
      const otherIssue = nodeFromIssue(linkedIssue);

      return { issueId: issue.key, blockType, otherIssue };
    });
}

function graphFromIssues(issues) {
  const issuesNodes = issues.map(nodeFromIssue);
  const issuesBlocks = issues.flatMap(blocksFromIssue);

  // Find the nodes present in blocks but not in nodes: these are not in the kanban board
  const extIssuesNodes = issuesBlocks
    .filter((b) => !issuesNodes.some((n) => b.otherIssue.issueId === n.issueId))
    .map((b) => b.otherIssue)
    .map((n) => (n.external = true));

  const nodes = [...issuesNodes, ...extIssuesNodes];

  let edges = issuesBlocks.map((b) => {
    const blocks = b.blockType === "blocks";

    return {
      source: blocks ? b.issueId : b.otherIssue.issueId,
      target: blocks ? b.otherIssue.issueId : b.issueId,
    };
  });

  // Deduplicate edges by "single key" on an object
  const edgesMap = {};

  edges.forEach((e) => {
    edgesMap[`${e.source} -> ${e.target}`] = e;
  });

  edges = Object.values(edgesMap);

  return { nodes, edges };
}

function addStatisticsToGraph(graph) {
  const nodes = graph.nodes;
  const edges = graph.edges;

  nodes.forEach((n) => {
    n.num_blockers = edges.filter((e) => e.target === n.issueId).length;
    n.num_blocked = edges.filter((e) => e.source === n.issueId).length;
  });
}

/*
  Apache eCharts data customization
*/
const colorsByLevel = {
  0: "green",
  1: "yellow",
  2: "orange",
};

function toChartNodes(nodes) {
  // Group nodes by number of blockers
  const nodesByBlockers = nodes.reduce((acc, n) => {
    const key = n.num_blockers;

    acc[key] = acc[key] || [];
    acc[key].push(n);

    return acc;
  }, {});

  const processedNodes = Object.values(nodesByBlockers).flatMap((nodes) => {
    const stackedNodes = [...nodes];

    // Nodes are stacked on top of each other on its vertical lane,
    // one per num_blockers value, in order to avoid overlapping
    stackedNodes.sort((n1, n2) => n1.issueId.localeCompare(n2.issueId));
    stackedNodes.forEach((n, i) => (n.stack_pos = i));

    return stackedNodes;
  });

  return processedNodes;
}

function categoryFor(val, prefix, suffix) {
  return `${prefix}${val}${suffix}`;
}

function categoriesFromSequence(seq, prefix, suffix) {
  // Deduplicate and sort
  let cats = [...new Set(seq)];
  cats.sort((a, b) => a - b);

  // Map to strings, better for category axis
  cats = cats.map((val) => categoryFor(val, prefix, suffix));

  return cats;
}

function dataNodeLabel(node) {
  const headerStyles = ["thLow", "thMed", "thHigh", "thVeryHigh"];

  const hStyleIdx = Math.min(node.num_blocked, 3);
  const hStyle = headerStyles[hStyleIdx];

  const formatter = `{th|${node.issueId}}{${hStyle}|}\n{hr|}\n\n ${node.issueSummary} \n`;

  return {
    show: true,
    formatter,
  };
}

function colorForLevel(level) {
  return colorsByLevel[level] || "red";
}

function categoryColor(cat, prefix, suffix) {
  // Remove prefix and suffix to get only the number
  const levelStr = cat.replace(prefix, "").replace(suffix, "");

  return colorForLevel(parseInt(levelStr));
}

function buildChartOption(jiraGraph) {
  const edges = jiraGraph.edges;
  const nodes = jiraGraph.nodes;

  const cNodes = toChartNodes(nodes);
  
  let categoriesX = cNodes.map((cn) => cn.num_blockers);
  categoriesX = categoriesFromSequence(categoriesX, "", " Blockers");

  const maxY = cNodes.reduce((acc, cn) => Math.max(acc, cn.stack_pos), 0);

  let categoriesY = cNodes.map((cn) => cn.stack_pos);
  categoriesY.push(maxY + 1); // add +1 category, barchart background include topmost nodes
  categoriesY = categoriesFromSequence(categoriesY, "", "");

  const xAxis = {
    type: "category",
    data: categoriesX,
    position: "bottom",
    nameLocation: "center",
  };

  const yAxis = {
    type: "category",
    show: false,
    data: categoriesY,
    boundaryGap: false,
  };

  const data = cNodes.map(function (cn) {
    return {
      id: cn.issueId,
      value: [
        categoryFor(cn.num_blockers, "", " Blockers"),
        categoryFor(cn.stack_pos, "", ""),
      ],
      label: dataNodeLabel(cn),
    };
  });

  const links = edges.map(function (e) {
    return {
      source: e.source,
      target: e.target,
      label: {
        show: true,
        formatter: "blocks",
      },
    };
  });

  const option = {
    title: {
      text: "Jira Issues Blockers",
    },
    grid: {
      show: false,
      containLabel: true,
      width: 300,
    },
    xAxis: xAxis,
    yAxis: yAxis,
    series: [
      {
        name: "Issue Blockers",
        type: "graph",
        data: data,
        links: links,
        zlevel: 1,
        layout: "none",
        draggable: true, // FIXME allow only dragging on its lane!
        coordinateSystem: "cartesian2d",
        symbol: "circle",
        symbolSize: 10,
        edgeSymbol: ["circle", "arrow"],
        edgeSymbolSize: [4, 10],
        lineStyle: {
          color: "source",
          curveness: 0.3,
        },
        emphasis: {
          focus: "adjacency",
          lineStyle: {
            width: 5,
          },
        },
        label: {
          show: true,
          position: "top",
          backgroundColor: "#ddd",
          borderColor: "#555",
          borderWidth: 1,
          borderRadius: 5,
          color: "#000",
          fontSize: 10,
          rich: {
            thLow: {
              align: "right",
              backgroundColor: colorForLevel(0),
              height: 10,
              borderRadius: [5, 5, 0, 0],
              padding: [5, 10, 0, 10],
              width: "100%",
              color: "#eee",
            },
            thMed: {
              align: "right",
              backgroundColor: colorForLevel(1),
              height: 10,
              borderRadius: [5, 5, 0, 0],
              padding: [5, 10, 0, 10],
              width: "100%",
              color: "#eee",
            },
            thHigh: {
              align: "right",
              backgroundColor: colorForLevel(2),
              height: 10,
              borderRadius: [5, 5, 0, 0],
              padding: [5, 10, 0, 10],
              width: "100%",
              color: "#eee",
            },
            thVeryHigh: {
              align: "right",
              backgroundColor: colorForLevel(3),
              height: 10,
              borderRadius: [5, 5, 0, 0],
              padding: [0, 10, 0, 10],
              width: "100%",
              color: "#eee",
            },
            th: {
              fontSize: 12,
              align: "center",
              color: "#000",
            },
            hr: {
              borderColor: "#777",
              width: "100%",
              borderWidth: 0.5,
              height: 0,
            },
          },
        },
      },
      {
        name: "background",
        showBackground: true,
        type: "bar",
        zlevel: 0,
        data: categoriesX.map(function (cat) {
          return {
            category: cat,
            value: maxY + 1, // Disabled when set to 0
          };
        }),
        barWidth: '95%',
        itemStyle: {
          color: (params) =>
            categoryColor(params.data.category, "", " Blockers"),
          opacity: 0.2,
        },
      },
    ],
  };

  return option;
}

