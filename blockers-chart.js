myChart.showLoading();

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

  const processedNodes = Object.entries(nodesByBlockers).flatMap(
    ([_numBlockers, nodes]) => {
      const stackedNodes = [...nodes];

      stackedNodes.sort((a, b) => a.issueId.localeCompare(b.issueId));
      stackedNodes.forEach((n, i) => (n.stack_pos = i));

      return stackedNodes;
    }
  );

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
  // Remove prefix and suffix
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

$.getJSON(ROOT_PATH + "/data/asset/data/les-miserables.json", function (json) {
  // TODO for testing on eCharts demo editor, remove later
  json = jiraGraph;

  const option = buildChartOption(json);

  myChart.hideLoading();

  myChart.setOption(option, true);
});

const jiraGraph = {
  nodes: [
    {
      issueId: "JD-1",
      issueType: "Story",
      issueSummary: "Test Story 01",
      num_blockers: 0,
      num_blocked: 0,
    },
    {
      issueId: "JD-2",
      issueType: "Sub-task",
      issueSummary: "TS 01 Subtask 01",
      num_blockers: 2,
      num_blocked: 0,
    },
    {
      issueId: "JD-3",
      issueType: "Sub-task",
      issueSummary: "TS 01 Subtask 02",
      num_blockers: 1,
      num_blocked: 1,
    },
    {
      issueId: "JD-4",
      issueType: "Story",
      issueSummary: "Test Story 02",
      num_blockers: 0,
      num_blocked: 0,
    },
    {
      issueId: "JD-5",
      issueType: "Sub-task",
      issueSummary: "TS 02 Subtask 01",
      num_blockers: 0,
      num_blocked: 1,
    },
  ],
  edges: [
    {
      source: "JD-3",
      target: "JD-2",
    },
    {
      source: "JD-5",
      target: "JD-3",
    },
    {
      source: "JD-5",
      target: "JD-2",
    },
  ],
};
