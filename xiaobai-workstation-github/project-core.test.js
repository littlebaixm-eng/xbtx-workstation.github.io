import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNT_OPTIONS,
  DIRECTOR_OPTIONS,
  STATUS_OPTIONS,
  TALENT_OPTIONS,
  TYPE_OPTIONS,
  buildCalendarEvents,
  createLibraryProjectDraft,
  evaluateViralStatus,
  normalizeLikeCount,
  projectColorIndex,
  createProjectDraftForDate,
  createProject,
  filterProjects,
  getDailyAgenda,
  getWeekday,
  mergeOptionList,
  addOptionToList,
  rescheduleProjectDate,
  validateProject,
} from "./project-core.js";

test("projectColorIndex gives a stable palette slot for the same project", () => {
  const project = createProject({ id: "project-asmr", title: "ASMR" });

  assert.equal(projectColorIndex(project, 8), projectColorIndex(project, 8));
  assert.equal(Number.isInteger(projectColorIndex(project, 8)), true);
  assert.equal(projectColorIndex(project, 8) >= 0, true);
  assert.equal(projectColorIndex(project, 8) < 8, true);
});

test("createProject stores normalized like counts for all release channels", () => {
  const project = createProject({
    douyinLikes: "3k",
    videoLikes: "1,200",
    redbookLikes: "2w",
  });

  assert.equal(project.douyinLikes, 3000);
  assert.equal(project.videoLikes, 1200);
  assert.equal(project.redbookLikes, 20000);
  assert.equal(normalizeLikeCount("-10"), 0);
});

test("evaluateViralStatus applies channel-specific small and big hit thresholds", () => {
  assert.deepEqual(evaluateViralStatus(createProject({ douyinLikes: 2999 })).level, "none");
  assert.deepEqual(evaluateViralStatus(createProject({ douyinLikes: 3000 })).level, "small");
  assert.deepEqual(evaluateViralStatus(createProject({ videoLikes: 1000 })).level, "small");
  assert.deepEqual(evaluateViralStatus(createProject({ redbookLikes: 1000 })).level, "small");
  assert.deepEqual(evaluateViralStatus(createProject({ douyinLikes: 20000 })).level, "big");
  assert.deepEqual(evaluateViralStatus(createProject({ videoLikes: 5000 })).level, "big");
  assert.deepEqual(evaluateViralStatus(createProject({ redbookLikes: 5000 })).level, "big");
});

test("default options match the user's workflow lists", () => {
  assert.deepEqual(TYPE_OPTIONS, ["原创", "预告", "商业"]);
  assert.deepEqual(DIRECTOR_OPTIONS, ["丸子", "11", "小青", "瑞克"]);
  assert.deepEqual(TALENT_OPTIONS, ["小新", "魏老师", "太医", "无人出镜"]);
  assert.deepEqual(STATUS_OPTIONS, ["待拍摄", "剪辑中", "待发布", "已发布"]);
  assert.deepEqual(ACCOUNT_OPTIONS, ["三楼", "丁医", "研究所", "丁妈"]);
});

test("mergeOptionList combines defaults and custom options without duplicates", () => {
  assert.deepEqual(
    mergeOptionList(["丸子", "瑞克"], ["瑞克", "新编导", "  "]),
    ["丸子", "瑞克", "新编导"],
  );
});

test("addOptionToList appends a trimmed new option once", () => {
  assert.deepEqual(addOptionToList(["丸子"], " 新编导 "), ["丸子", "新编导"]);
  assert.deepEqual(addOptionToList(["丸子"], "丸子"), ["丸子"]);
  assert.deepEqual(addOptionToList(["丸子"], ""), ["丸子"]);
});

test("createProject defaults editing end date to editing start date", () => {
  const project = createProject({
    title: "品牌短片",
    type: "商业",
    editStartDate: "2026-06-25",
  });

  assert.equal(project.editEndDate, "2026-06-25");
});

test("createProject stores release account", () => {
  const project = createProject({
    title: "预告片",
    type: "预告",
    releaseAccount: "三楼",
  });

  assert.equal(project.releaseAccount, "三楼");
});

test("getWeekday returns Chinese weekday text", () => {
  assert.equal(getWeekday("2026-06-23"), "星期二");
});

test("validateProject rejects an editing end date before the start date", () => {
  const result = validateProject({
    title: "发布预告",
    type: "预告",
    editStartDate: "2026-06-26",
    editEndDate: "2026-06-25",
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ["剪辑结束日期不能早于剪辑开始日期"]);
});

test("filterProjects matches search text, status, type, and release account", () => {
  const projects = [
    createProject({ title: "原创探店", type: "原创", director: "丸子", releaseAccount: "三楼", status: "待拍摄" }),
    createProject({ title: "618商业片", type: "商业", director: "瑞克", releaseAccount: "丁医", status: "待发布" }),
  ];

  const result = filterProjects(projects, {
    search: "瑞克",
    status: "待发布",
    type: "商业",
    releaseAccount: "丁医",
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].title, "618商业片");
});

test("buildCalendarEvents creates shooting, editing, and release events", () => {
  const project = createProject({
    title: "新品发布",
    type: "商业",
    shootDate: "2026-06-23",
    editStartDate: "2026-06-24",
    editEndDate: "2026-06-25",
    releaseDate: "2026-06-28",
  });

  const events = buildCalendarEvents([project]);

  assert.deepEqual(
    events.map((event) => `${event.kind}:${event.date}:${event.title}`),
    [
      "shoot:2026-06-23:拍摄 新品发布",
      "edit:2026-06-24:剪辑 新品发布",
      "edit:2026-06-25:剪辑 新品发布",
      "release:2026-06-28:发布 新品发布",
    ],
  );
});

test("buildCalendarEvents skips weekends for multi-day editing ranges", () => {
  const project = createProject({
    title: "跨周剪辑",
    type: "原创",
    editStartDate: "2026-06-19",
    editEndDate: "2026-06-23",
  });

  const events = buildCalendarEvents([project]);

  assert.deepEqual(
    events.map((event) => `${event.kind}:${event.date}:${event.title}`),
    [
      "edit:2026-06-19:剪辑 跨周剪辑",
      "edit:2026-06-22:剪辑 跨周剪辑",
      "edit:2026-06-23:剪辑 跨周剪辑",
    ],
  );
});

test("getDailyAgenda groups today's shooting, editing, and release work", () => {
  const projects = [
    createProject({ title: "今日拍摄", type: "原创", shootDate: "2026-06-23" }),
    createProject({ title: "今日剪辑", type: "商业", editStartDate: "2026-06-22", editEndDate: "2026-06-24" }),
    createProject({ title: "今日发布", type: "预告", releaseDate: "2026-06-23" }),
    createProject({ title: "明天拍摄", type: "原创", shootDate: "2026-06-24" }),
  ];

  const agenda = getDailyAgenda(projects, "2026-06-23");

  assert.deepEqual(agenda.shooting.map((project) => project.title), ["今日拍摄"]);
  assert.deepEqual(agenda.editing.map((project) => project.title), ["今日剪辑"]);
  assert.deepEqual(agenda.release.map((project) => project.title), ["今日发布"]);
});

test("getDailyAgenda does not show editing work on weekends", () => {
  const projects = [
    createProject({ title: "跨周剪辑", type: "原创", editStartDate: "2026-06-19", editEndDate: "2026-06-23" }),
    createProject({ title: "周末拍摄", type: "商业", shootDate: "2026-06-20" }),
    createProject({ title: "周末发布", type: "预告", releaseDate: "2026-06-20" }),
  ];

  const agenda = getDailyAgenda(projects, "2026-06-20");

  assert.deepEqual(agenda.editing.map((project) => project.title), []);
  assert.deepEqual(agenda.shooting.map((project) => project.title), ["周末拍摄"]);
  assert.deepEqual(agenda.release.map((project) => project.title), ["周末发布"]);
});

test("createProjectDraftForDate fills the selected calendar date by task kind", () => {
  assert.equal(createProjectDraftForDate("2026-06-23", "shoot").shootDate, "2026-06-23");
  assert.equal(createProjectDraftForDate("2026-06-23", "edit").editStartDate, "2026-06-23");
  assert.equal(createProjectDraftForDate("2026-06-23", "edit").editEndDate, "2026-06-23");
  assert.equal(createProjectDraftForDate("2026-06-23", "release").releaseDate, "2026-06-23");
});

test("createLibraryProjectDraft creates an archive-only project without calendar dates", () => {
  const project = createLibraryProjectDraft();

  assert.equal(project.status, "已发布");
  assert.equal(project.shootDate, "");
  assert.equal(project.editStartDate, "");
  assert.equal(project.editEndDate, "");
  assert.equal(project.releaseDate, "");
  assert.deepEqual(buildCalendarEvents([project]), []);
  assert.deepEqual(getDailyAgenda([project], "2026-06-24"), {
    shooting: [],
    editing: [],
    release: [],
  });
});

test("rescheduleProjectDate moves shooting and release dates", () => {
  const project = createProject({
    title: "改期项目",
    type: "原创",
    shootDate: "2026-06-23",
    releaseDate: "2026-06-30",
  });

  assert.equal(rescheduleProjectDate(project, "shoot", "2026-06-23", "2026-06-24").shootDate, "2026-06-24");
  assert.equal(rescheduleProjectDate(project, "release", "2026-06-30", "2026-07-01").releaseDate, "2026-07-01");
});

test("rescheduleProjectDate shifts the whole editing range by the dragged day delta", () => {
  const project = createProject({
    title: "剪辑改期",
    type: "商业",
    editStartDate: "2026-06-19",
    editEndDate: "2026-06-23",
  });

  const moved = rescheduleProjectDate(project, "edit", "2026-06-22", "2026-06-25");

  assert.equal(moved.editStartDate, "2026-06-22");
  assert.equal(moved.editEndDate, "2026-06-26");
});

test("rescheduleProjectDate normalizes editing weekend drops to next Monday", () => {
  const project = createProject({
    title: "周末拖动",
    type: "商业",
    editStartDate: "2026-06-19",
    editEndDate: "2026-06-23",
  });

  const moved = rescheduleProjectDate(project, "edit", "2026-06-19", "2026-06-20");

  assert.equal(moved.editStartDate, "2026-06-22");
  assert.equal(moved.editEndDate, "2026-06-26");
});
