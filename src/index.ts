import { Octokit } from "@octokit/rest";
import slugify from "@sindresorhus/slugify";
import { CanvasRenderService } from "chartjs-node-canvas";
import { ensureDir, readFile, readJson, writeFile, writeJson } from "fs-extra";
import { safeLoad } from "js-yaml";
import { join } from "path";

const canvasRenderService = new CanvasRenderService(600, 400);

const getUptimeColor = (uptime: number) =>
  uptime > 95
    ? "brightgreen"
    : uptime > 90
    ? "green"
    : uptime > 85
    ? "yellowgreen"
    : uptime > 80
    ? "yellow"
    : uptime > 75
    ? "orange"
    : "red";
const getResponseTimeColor = (responseTime: number) =>
  responseTime < 200
    ? "brightgreen"
    : responseTime < 400
    ? "green"
    : responseTime < 600
    ? "yellowgreen"
    : responseTime < 800
    ? "yellow"
    : responseTime < 1000
    ? "orange"
    : "red";

export const generateGraphs = async () => {
  const config = safeLoad(await readFile(join(".", ".upptimerc.yml"), "utf8")) as {
    sites: { name: string; url: string }[];
    owner: string;
    repo: string;
    userAgent?: string;
    PAT?: string;
    assignees?: string[];
  };
  const owner = config.owner;
  const repo = config.repo;

  const octokit = new Octokit({
    auth: config.PAT || process.env.GH_PAT || process.env.GITHUB_TOKEN,
    userAgent: config.userAgent || process.env.USER_AGENT || "KojBot",
  });

  await ensureDir(join(".", "graphs"));

  for await (const site of config.sites) {
    const slug = slugify(site.name);

    let uptime = 0;
    let uptimeDay = 0;
    let uptimeWeek = 0;
    let uptimeMonth = 0;
    let uptimeYear = 0;
    let responseTime = 0;
    let timeDay = 0;
    let timeWeek = 0;
    let timeMonth = 0;
    let timeYear = 0;
    try {
      const api: {
        name: string;
        url: string;
        slug: string;
        status: string;
        uptime: string;
        uptimeDay?: string;
        uptimeWeek?: string;
        uptimeMonth?: string;
        uptimeYear?: string;
        time: number;
        timeDay?: number;
        timeWeek?: number;
        timeMonth?: number;
        timeYear?: number;
      }[] = await readJson(join(".", "history", "summary.json"));
      const item = api.find((site) => site.slug === slug);
      if (item) {
        uptime = parseFloat(item.uptime);
        uptimeDay = parseFloat(item.uptimeDay || "0");
        uptimeWeek = parseFloat(item.uptimeWeek || "0");
        uptimeMonth = parseFloat(item.uptimeMonth || "0");
        uptimeYear = parseFloat(item.uptimeYear || "0");
        responseTime = item.time;
        timeDay = item.timeDay || 0;
        timeWeek = item.timeWeek || 0;
        timeMonth = item.timeMonth || 0;
        timeYear = item.timeYear || 0;
      }
    } catch (error) {}
    await ensureDir(join(".", "api", slug));
    await writeJson(join(".", "api", slug, "uptime.json"), {
      schemaVersion: 1,
      label: "uptime",
      message: `${uptime}%`,
      color: getUptimeColor(uptime),
    });
    await writeJson(join(".", "api", slug, "uptime-day.json"), {
      schemaVersion: 1,
      label: "uptime 24h",
      message: `${uptimeDay}%`,
      color: getUptimeColor(uptimeDay),
    });
    await writeJson(join(".", "api", slug, "uptime-week.json"), {
      schemaVersion: 1,
      label: "uptime 7d",
      message: `${uptimeWeek}%`,
      color: getUptimeColor(uptimeWeek),
    });
    await writeJson(join(".", "api", slug, "uptime-month.json"), {
      schemaVersion: 1,
      label: "uptime 30d",
      message: `${uptimeMonth}%`,
      color: getUptimeColor(uptimeMonth),
    });
    await writeJson(join(".", "api", slug, "uptime-year.json"), {
      schemaVersion: 1,
      label: "uptime 1y",
      message: `${uptimeYear}%`,
      color: getUptimeColor(uptimeYear),
    });
    await writeJson(join(".", "api", slug, "response-time.json"), {
      schemaVersion: 1,
      label: "response time",
      message: `${responseTime} ms`,
      color: getResponseTimeColor(responseTime),
    });
    await writeJson(join(".", "api", slug, "response-time-day.json"), {
      schemaVersion: 1,
      label: "response time 24h",
      message: `${timeDay} ms`,
      color: getResponseTimeColor(timeDay),
    });
    await writeJson(join(".", "api", slug, "response-time-week.json"), {
      schemaVersion: 1,
      label: "response time 7d",
      message: `${timeWeek} ms`,
      color: getResponseTimeColor(timeWeek),
    });
    await writeJson(join(".", "api", slug, "response-time-month.json"), {
      schemaVersion: 1,
      label: "response time 30d",
      message: `${timeMonth} ms`,
      color: getResponseTimeColor(timeMonth),
    });
    await writeJson(join(".", "api", slug, "response-time-year.json"), {
      schemaVersion: 1,
      label: "response time 1y",
      message: `${timeYear} ms`,
      color: getResponseTimeColor(timeYear),
    });

    const history = await octokit.repos.listCommits({
      owner,
      repo,
      path: `history/${slug}.yml`,
      per_page: 10,
    });
    if (!history.data.length) continue;
    const data: [number, string][] = history.data
      .reverse()
      .filter(
        (item) =>
          item.commit.message.includes(" in ") &&
          Number(item.commit.message.split(" in ")[1].split("ms")[0]) !== 0
      )
      .map((item) => [
        Number(item.commit.message.split(" in ")[1].split("ms")[0]),
        String(item.commit.author.date),
      ]);
    const image = await canvasRenderService.renderToBuffer({
      type: "line",
      data: {
        labels: [1, ...data.map((item) => item[1])],
        datasets: [
          {
            backgroundColor: "#89e0cf",
            borderColor: "#1abc9c",
            data: [1, ...data.map((item) => item[0])],
          },
        ],
      },
      options: {
        legend: { display: false },
        scales: {
          xAxes: [
            {
              display: false,
              gridLines: {
                display: false,
              },
            },
          ],
          yAxes: [
            {
              display: false,
              gridLines: {
                display: false,
              },
            },
          ],
        },
      },
    });
    await writeFile(join(".", "graphs", `${slug}.png`), image);
  }
};
