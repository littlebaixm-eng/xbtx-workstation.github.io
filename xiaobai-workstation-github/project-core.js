const STORAGE_VERSION = 1;

const TYPE_OPTIONS = ["原创", "预告", "商业"];
const DIRECTOR_OPTIONS = ["丸子", "11", "小青", "瑞克"];
const TALENT_OPTIONS = ["小新", "魏老师", "太医", "无人出镜"];
const STATUS_OPTIONS = ["待拍摄", "剪辑中", "待发布", "已发布"];
const ACCOUNT_OPTIONS = ["三楼", "丁医", "研究所", "丁妈"];
const SCRIPT_STATUS_OPTIONS = ["未确认", "已确认"];
const CONFIRM_STATUS_OPTIONS = ["未确认", "已确认"];
const RELEASE_STATUS_OPTIONS = ["未发布", "已发布"];

function makeId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayIso() {
  return formatLocalDate(new Date());
}

function normalizeText(value) {
  return String(value || "").trim();
}

function mergeOptionList(defaultOptions, customOptions = []) {
  const seen = new Set();
  const result = [];

  for (const option of [...defaultOptions, ...customOptions]) {
    const value = normalizeText(option);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }

  return result;
}

function addOptionToList(options, option) {
  return mergeOptionList(options, [option]);
}

function normalizeLikeCount(value) {
  const text = normalizeText(value).toLowerCase().replace(/,/g, "");
  if (!text) return 0;

  let multiplier = 1;
  let numberText = text;
  if (text.endsWith("k")) {
    multiplier = 1000;
    numberText = text.slice(0, -1);
  } else if (text.endsWith("w") || text.endsWith("万")) {
    multiplier = 10000;
    numberText = text.slice(0, -1);
  }

  const count = Math.floor(Number.parseFloat(numberText) * multiplier);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function evaluateViralStatus(project = {}) {
  const douyinLikes = normalizeLikeCount(project.douyinLikes);
  const videoLikes = normalizeLikeCount(project.videoLikes);
  const redbookLikes = normalizeLikeCount(project.redbookLikes);

  if (douyinLikes >= 20000 || videoLikes >= 5000 || redbookLikes >= 5000) {
    return { level: "big", label: "大爆款" };
  }

  if (douyinLikes >= 3000 || videoLikes >= 1000 || redbookLikes >= 1000) {
    return { level: "small", label: "小爆款" };
  }

  return { level: "none", label: "未达标" };
}

function projectColorIndex(project, paletteSize = 8) {
  const size = Number.isFinite(paletteSize) && paletteSize > 0 ? Math.floor(paletteSize) : 1;
  const seed = normalizeText(project?.id) || normalizeText(project?.title);
  let hash = 0;

  for (const char of seed || "project") {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return hash % size;
}

function createProject(input = {}) {
  const editStartDate = normalizeText(input.editStartDate);
  const editEndDate = normalizeText(input.editEndDate) || editStartDate;

  return {
    id: input.id || makeId(),
    title: normalizeText(input.title),
    type: normalizeText(input.type) || TYPE_OPTIONS[0],
    director: normalizeText(input.director),
    talent: normalizeText(input.talent),
    shootDate: normalizeText(input.shootDate),
    shootContent: normalizeText(input.shootContent),
    scriptDoc: normalizeText(input.scriptDoc),
    scriptStatus: normalizeText(input.scriptStatus) || SCRIPT_STATUS_OPTIONS[0],
    editStartDate,
    editEndDate,
    editContent: normalizeText(input.editContent),
    directorConfirmStatus: normalizeText(input.directorConfirmStatus) || CONFIRM_STATUS_OPTIONS[0],
    releaseDate: normalizeText(input.releaseDate),
    releaseAccount: normalizeText(input.releaseAccount),
    releaseStatus: normalizeText(input.releaseStatus) || RELEASE_STATUS_OPTIONS[0],
    douyinLikes: normalizeLikeCount(input.douyinLikes),
    videoLikes: normalizeLikeCount(input.videoLikes),
    redbookLikes: normalizeLikeCount(input.redbookLikes),
    status: normalizeText(input.status) || STATUS_OPTIONS[0],
    notes: normalizeText(input.notes),
    createdAt: input.createdAt || todayIso(),
    updatedAt: todayIso(),
  };
}

function getWeekday(dateText) {
  if (!dateText) return "";
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][date.getDay()];
}

function isWeekday(dateText) {
  if (!dateText) return false;
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function validateProject(project) {
  const errors = [];
  if (!normalizeText(project.title)) errors.push("项目名不能为空");
  if (!normalizeText(project.type)) errors.push("片子类型不能为空");
  if (project.editStartDate && project.editEndDate && project.editEndDate < project.editStartDate) {
    errors.push("剪辑结束日期不能早于剪辑开始日期");
  }
  return { valid: errors.length === 0, errors };
}

function filterProjects(projects, filters = {}) {
  const search = normalizeText(filters.search).toLowerCase();
  const status = filters.status || "全部状态";
  const type = filters.type || "全部类型";
  const releaseAccount = filters.releaseAccount || "全部账号";

  return projects.filter((project) => {
    const searchable = [
      project.title,
      project.director,
      project.talent,
      project.shootContent,
      project.editContent,
      project.releaseAccount,
      project.notes,
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch = !search || searchable.includes(search);
    const matchesStatus = status === "全部状态" || project.status === status;
    const matchesType = type === "全部类型" || project.type === type;
    const matchesAccount = releaseAccount === "全部账号" || project.releaseAccount === releaseAccount;

    return matchesSearch && matchesStatus && matchesType && matchesAccount;
  });
}

function addDays(dateText, amount) {
  const date = new Date(`${dateText}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return formatLocalDate(date);
}

function daysBetween(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.round((end - start) / 86400000);
}

function nextWeekday(dateText) {
  let current = dateText;
  while (!isWeekday(current)) {
    current = addDays(current, 1);
  }
  return current;
}

function buildCalendarEvents(projects) {
  const events = [];

  for (const project of projects) {
    if (project.shootDate) {
      events.push({
        id: `${project.id}-shoot-${project.shootDate}`,
        projectId: project.id,
        kind: "shoot",
        date: project.shootDate,
        title: `拍摄 ${project.title}`,
      });
    }

    if (project.editStartDate) {
      const endDate = project.editEndDate || project.editStartDate;
      let current = project.editStartDate;
      while (current <= endDate) {
        if (isWeekday(current)) {
          events.push({
            id: `${project.id}-edit-${current}`,
            projectId: project.id,
            kind: "edit",
            date: current,
            title: `剪辑 ${project.title}`,
          });
        }
        current = addDays(current, 1);
      }
    }

    if (project.releaseDate) {
      events.push({
        id: `${project.id}-release-${project.releaseDate}`,
        projectId: project.id,
        kind: "release",
        date: project.releaseDate,
        title: `发布 ${project.title}`,
      });
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

function getDailyAgenda(projects, dateText) {
  return {
    shooting: projects.filter((project) => project.shootDate === dateText),
    editing: projects.filter((project) => (
      project.editStartDate
      && dateText >= project.editStartDate
      && dateText <= (project.editEndDate || project.editStartDate)
      && isWeekday(dateText)
    )),
    release: projects.filter((project) => project.releaseDate === dateText),
  };
}

function createProjectDraftForDate(dateText, kind) {
  const draft = {};

  if (kind === "shoot") {
    draft.shootDate = dateText;
    draft.status = "待拍摄";
  }

  if (kind === "edit") {
    draft.editStartDate = dateText;
    draft.editEndDate = dateText;
    draft.status = "剪辑中";
  }

  if (kind === "release") {
    draft.releaseDate = dateText;
    draft.status = "待发布";
  }

  return createProject(draft);
}

function createLibraryProjectDraft() {
  return createProject({
    status: "已发布",
    releaseStatus: "已发布",
  });
}

function rescheduleProjectDate(project, kind, sourceDate, targetDate) {
  if (kind === "shoot") {
    return createProject({ ...project, shootDate: targetDate });
  }

  if (kind === "release") {
    return createProject({ ...project, releaseDate: targetDate });
  }

  if (kind === "edit") {
    const normalizedTarget = nextWeekday(targetDate);
    const delta = daysBetween(sourceDate, normalizedTarget);
    const editStartDate = addDays(project.editStartDate, delta);
    const editEndDate = addDays(project.editEndDate || project.editStartDate, delta);
    return createProject({ ...project, editStartDate, editEndDate });
  }

  return createProject(project);
}

export {
  ACCOUNT_OPTIONS,
  CONFIRM_STATUS_OPTIONS,
  DIRECTOR_OPTIONS,
  RELEASE_STATUS_OPTIONS,
  SCRIPT_STATUS_OPTIONS,
  STATUS_OPTIONS,
  STORAGE_VERSION,
  TALENT_OPTIONS,
  TYPE_OPTIONS,
  addOptionToList,
  buildCalendarEvents,
  createLibraryProjectDraft,
  createProject,
  createProjectDraftForDate,
  evaluateViralStatus,
  filterProjects,
  getDailyAgenda,
  getWeekday,
  isWeekday,
  mergeOptionList,
  normalizeLikeCount,
  projectColorIndex,
  rescheduleProjectDate,
  validateProject,
};
