import {
  ACCOUNT_OPTIONS,
  CONFIRM_STATUS_OPTIONS,
  DIRECTOR_OPTIONS,
  RELEASE_STATUS_OPTIONS,
  SCRIPT_STATUS_OPTIONS,
  STATUS_OPTIONS,
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
  mergeOptionList,
  normalizeWorkspaceData,
  projectColorIndex,
  rescheduleProjectDate,
  validateProject,
} from "./project-core.js?v=20260624-cloud-sync-4";

const STORAGE_KEY = "video-schedule-projects-v1";
const OPTIONS_STORAGE_KEY = "video-schedule-options-v1";
const SUPABASE_URL = "https://zckbohautakqhkgynfwu.supabase.co";
const SUPABASE_KEY = "sb_publishable_GAh9CazsIjqPs-i1Eh3Y7Q_DX1ChEdR";
const CLOUD_ROW_ID = "main";
const CLOUD_TABLE = "workstation_data";
const CLOUD_ENDPOINT = `${SUPABASE_URL}/rest/v1/${CLOUD_TABLE}`;
const ALL_STATUS = "全部状态";
const ALL_TYPES = "全部类型";
const ALL_ACCOUNTS = "全部账号";
const ADD_PREFIX = "__add_option__:";

const optionConfig = {
  type: { label: "片子类型", defaults: TYPE_OPTIONS },
  director: { label: "编导", defaults: DIRECTOR_OPTIONS },
  talent: { label: "出镜人", defaults: TALENT_OPTIONS },
  status: { label: "项目状态", defaults: STATUS_OPTIONS },
  releaseAccount: { label: "发布账号", defaults: ACCOUNT_OPTIONS },
};

const state = {
  projects: [],
  customOptions: {},
  filters: { search: "", status: ALL_STATUS, type: ALL_TYPES, releaseAccount: ALL_ACCOUNTS },
  currentView: "today",
  calendarDate: new Date(),
  quickAddDate: "",
  cloudStatus: "正在连接云端",
  cloudReady: false,
  saveTimer: null,
};

const elements = {
  summaryText: document.querySelector("#summaryText"),
  cloudStatusText: document.querySelector("#cloudStatusText"),
  addProjectButton: document.querySelector("#addProjectButton"),
  addArchiveButton: document.querySelector("#addArchiveButton"),
  addTodayButton: document.querySelector("#addTodayButton"),
  todayView: document.querySelector("#todayView"),
  tableView: document.querySelector("#tableView"),
  calendarView: document.querySelector("#calendarView"),
  todayTitle: document.querySelector("#todayTitle"),
  todaySummary: document.querySelector("#todaySummary"),
  shootingCount: document.querySelector("#shootingCount"),
  editingCount: document.querySelector("#editingCount"),
  releaseCount: document.querySelector("#releaseCount"),
  shootingAgenda: document.querySelector("#shootingAgenda"),
  editingAgenda: document.querySelector("#editingAgenda"),
  releaseAgenda: document.querySelector("#releaseAgenda"),
  projectTableBody: document.querySelector("#projectTableBody"),
  emptyState: document.querySelector("#emptyState"),
  searchInput: document.querySelector("#searchInput"),
  statusFilter: document.querySelector("#statusFilter"),
  typeFilter: document.querySelector("#typeFilter"),
  accountFilter: document.querySelector("#accountFilter"),
  tabs: document.querySelectorAll(".tab"),
  calendarTitle: document.querySelector("#calendarTitle"),
  calendarGrid: document.querySelector("#calendarGrid"),
  prevMonthButton: document.querySelector("#prevMonthButton"),
  nextMonthButton: document.querySelector("#nextMonthButton"),
  dialog: document.querySelector("#projectDialog"),
  form: document.querySelector("#projectForm"),
  formError: document.querySelector("#formError"),
  dialogTitle: document.querySelector("#dialogTitle"),
  closeDialogButton: document.querySelector("#closeDialogButton"),
  cancelButton: document.querySelector("#cancelButton"),
  deleteProjectButton: document.querySelector("#deleteProjectButton"),
  projectId: document.querySelector("#projectId"),
  titleInput: document.querySelector("#titleInput"),
  typeInput: document.querySelector("#typeInput"),
  directorInput: document.querySelector("#directorInput"),
  talentInput: document.querySelector("#talentInput"),
  statusInput: document.querySelector("#statusInput"),
  shootDateInput: document.querySelector("#shootDateInput"),
  shootContentInput: document.querySelector("#shootContentInput"),
  scriptDocInput: document.querySelector("#scriptDocInput"),
  scriptStatusInput: document.querySelector("#scriptStatusInput"),
  editStartInput: document.querySelector("#editStartInput"),
  editEndInput: document.querySelector("#editEndInput"),
  editContentInput: document.querySelector("#editContentInput"),
  directorConfirmInput: document.querySelector("#directorConfirmInput"),
  releaseDateInput: document.querySelector("#releaseDateInput"),
  releaseAccountInput: document.querySelector("#releaseAccountInput"),
  releaseStatusInput: document.querySelector("#releaseStatusInput"),
  douyinLikesInput: document.querySelector("#douyinLikesInput"),
  videoLikesInput: document.querySelector("#videoLikesInput"),
  redbookLikesInput: document.querySelector("#redbookLikesInput"),
  notesInput: document.querySelector("#notesInput"),
  quickAddDialog: document.querySelector("#quickAddDialog"),
  quickAddTitle: document.querySelector("#quickAddTitle"),
  closeQuickAddButton: document.querySelector("#closeQuickAddButton"),
  quickOptions: document.querySelectorAll(".quick-option"),
};

function optionList(key) {
  return mergeOptionList(optionConfig[key].defaults, state.customOptions[key] || []);
}

function addCustomOption(key, value) {
  const merged = addOptionToList(optionList(key), value);
  state.customOptions[key] = merged.filter((option) => !optionConfig[key].defaults.includes(option));
  saveOptions();
  refreshOptionControls();
  return value.trim();
}

function fillSelect(select, options, config = {}) {
  const {
    firstOption = "",
    selectedValue = "",
    allowAdd = false,
    optionKey = "",
  } = config;

  select.innerHTML = "";
  if (firstOption) {
    select.append(new Option(firstOption, firstOption));
  }

  const finalOptions = mergeOptionList(options, selectedValue ? [selectedValue] : []);
  for (const option of finalOptions) {
    select.append(new Option(option, option));
  }

  if (allowAdd && optionKey) {
    select.append(new Option(`+ 新增${optionConfig[optionKey].label}`, `${ADD_PREFIX}${optionKey}`));
  }

  if (selectedValue) {
    select.value = selectedValue;
  }
}

function fillManagedSelect(select, key, selectedValue = "") {
  fillSelect(select, optionList(key), {
    selectedValue,
    allowAdd: true,
    optionKey: key,
  });
}

function fillFilterSelect(select, options, firstOption) {
  fillSelect(select, options, { firstOption, selectedValue: select.value || firstOption });
}

function loadProjects() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((project) => createProject(project));
  } catch {
    return [];
  }
}

function saveProjects() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.projects));
  queueCloudSave();
}

function loadOptions() {
  try {
    const raw = localStorage.getItem(OPTIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function saveOptions() {
  localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(state.customOptions));
  queueCloudSave();
}

function cloudHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function hasWorkspaceData(projects = state.projects, options = state.customOptions) {
  return projects.length > 0 || Object.keys(options).length > 0;
}

function setCloudStatus(status) {
  state.cloudStatus = status;
  renderSummary();
}

async function loadCloudWorkspace() {
  const response = await fetch(`${CLOUD_ENDPOINT}?id=eq.${CLOUD_ROW_ID}&select=projects,options`, {
    headers: cloudHeaders(),
  });
  if (!response.ok) throw new Error(`云端读取失败：${response.status}`);
  const rows = await response.json();
  return normalizeWorkspaceData(rows[0] || {});
}

async function saveCloudWorkspaceNow() {
  if (!state.cloudReady) return;
  setCloudStatus("正在保存云端");
  const response = await fetch(`${CLOUD_ENDPOINT}?on_conflict=id`, {
    method: "POST",
    headers: cloudHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({
      id: CLOUD_ROW_ID,
      projects: state.projects,
      options: state.customOptions,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error(`云端保存失败：${response.status}`);
  setCloudStatus("云端已保存");
}

function queueCloudSave() {
  if (!state.cloudReady) return;
  window.clearTimeout(state.saveTimer);
  state.saveTimer = window.setTimeout(() => {
    saveCloudWorkspaceNow().catch((error) => setCloudStatus(`${error.message}，本机已保存`));
  }, 500);
}

function isSampleProjectSet(projects) {
  return projects.length === 1 && projects[0]?.title === "样例：今日拍摄";
}

function hasRealWorkspaceData(projects = state.projects, options = state.customOptions) {
  return hasWorkspaceData(projects, options) && !isSampleProjectSet(projects);
}

async function syncCloudOnStart() {
  try {
    const localProjects = [...state.projects];
    const localOptions = { ...state.customOptions };
    const cloudData = await loadCloudWorkspace();
    state.cloudReady = true;

    if (hasRealWorkspaceData(localProjects, localOptions) && isSampleProjectSet(cloudData.projects)) {
      await saveCloudWorkspaceNow();
      return;
    }

    if (hasRealWorkspaceData(cloudData.projects, cloudData.options)) {
      state.projects = cloudData.projects;
      state.customOptions = cloudData.options;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.projects));
      localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(state.customOptions));
      refreshOptionControls();
      render();
      setCloudStatus("云端已同步");
      return;
    }

    if (hasRealWorkspaceData(localProjects, localOptions)) {
      await saveCloudWorkspaceNow();
      return;
    }

    if (isSampleProjectSet(localProjects)) {
      state.projects = [];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.projects));
      render();
    }

    setCloudStatus("云端已连接");
  } catch (error) {
    state.cloudReady = false;
    setCloudStatus(`${error.message || "云端连接失败"}，本机保存中`);
  }
}

function isoFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayIso() {
  return isoFromDate(new Date());
}

function formatDate(dateText) {
  if (!dateText) return "未定";
  return `${dateText} ${getWeekday(dateText)}`;
}

function formatShortDate(dateText) {
  if (!dateText) return "未定";
  const [year, month, day] = dateText.split("-");
  return `${Number(year)}.${Number(month)}.${Number(day)}`;
}

function formatShortRange(startDate, endDate) {
  if (!startDate) return "未定";
  const normalizedEnd = endDate || startDate;
  if (startDate === normalizedEnd) return formatShortDate(startDate);
  return `${formatShortDate(startDate)} - ${formatShortDate(normalizedEnd)}`;
}

function filteredProjects() {
  return filterProjects(state.projects, state.filters);
}

function renderSummary() {
  const visibleCount = filteredProjects().length;
  elements.summaryText.textContent = `${state.projects.length} 个项目，项目库显示 ${visibleCount} 个`;
  elements.cloudStatusText.textContent = state.cloudStatus;
  elements.cloudStatusText.className = `cloud-status ${
    state.cloudStatus.includes("失败") ? "cloud-error" : "cloud-ok"
  }`;
}

function createMeta(label, value) {
  if (!value) return "";
  return `<span>${label}：${value}</span>`;
}

function renderAgendaList(container, projects, kind) {
  container.innerHTML = "";

  if (!projects.length) {
    const empty = document.createElement("p");
    empty.className = "agenda-empty";
    empty.textContent = "今天没有安排";
    container.append(empty);
    return;
  }

  for (const project of projects) {
    const button = document.createElement("button");
    button.className = `agenda-card ${kind}-card`;
    button.type = "button";
    const description = kind === "shoot"
      ? project.shootContent || "未填写拍摄内容"
      : kind === "edit"
        ? project.editContent || "未填写剪辑内容"
        : `${project.releaseAccount || "未选账号"} · ${project.releaseStatus}`;

    button.innerHTML = `
      <strong></strong>
      <p></p>
      <div class="agenda-meta"></div>
    `;
    button.querySelector("strong").textContent = project.title || "未命名片子";
    button.querySelector("p").textContent = description;
    button.querySelector(".agenda-meta").innerHTML = [
      createMeta("编导", project.director),
      createMeta("出镜", kind === "shoot" ? project.talent : ""),
      createMeta("脚本", kind === "shoot" ? project.scriptDoc : ""),
      createMeta("状态", kind !== "shoot" ? project.status : ""),
    ].filter(Boolean).join("");
    button.addEventListener("click", () => openEditor(project.id));
    container.append(button);
  }
}

function renderToday() {
  const dateText = todayIso();
  const agenda = getDailyAgenda(state.projects, dateText);
  const weekday = getWeekday(dateText);

  elements.todayTitle.textContent = `${dateText} ${weekday}`;
  elements.todaySummary.textContent = `拍摄 ${agenda.shooting.length} · 剪辑 ${agenda.editing.length} · 发布 ${agenda.release.length}`;
  elements.shootingCount.textContent = `${agenda.shooting.length} 项`;
  elements.editingCount.textContent = `${agenda.editing.length} 项`;
  elements.releaseCount.textContent = `${agenda.release.length} 项`;

  renderAgendaList(elements.shootingAgenda, agenda.shooting, "shoot");
  renderAgendaList(elements.editingAgenda, agenda.editing, "edit");
  renderAgendaList(elements.releaseAgenda, agenda.release, "release");
}

function updateProjectField(projectId, field, value) {
  const index = state.projects.findIndex((project) => project.id === projectId);
  if (index < 0) return;
  state.projects[index] = createProject({ ...state.projects[index], [field]: value });
  saveProjects();
  render();
}

function createInlineSelect(project, field, key) {
  const select = document.createElement("select");
  select.className = "inline-select";
  fillManagedSelect(select, key, project[field] || "");
  select.addEventListener("click", (event) => event.stopPropagation());
  select.addEventListener("change", () => {
    const value = resolveAddOption(select, key, project[field] || "");
    if (!value) {
      select.value = project[field] || "";
      return;
    }
    updateProjectField(project.id, field, value);
  });
  return select;
}

function createLikeInput(project, field, label) {
  const wrapper = document.createElement("label");
  wrapper.className = "like-field";
  const labelText = document.createElement("span");
  const input = document.createElement("input");

  labelText.textContent = label;
  input.value = project[field] || "";
  input.inputMode = "numeric";
  input.placeholder = "0";
  input.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("change", () => updateProjectField(project.id, field, input.value));
  wrapper.append(labelText, input);
  return wrapper;
}

function createViralBadge(project) {
  const status = evaluateViralStatus(project);
  const badge = document.createElement("span");
  badge.className = `viral-badge viral-${status.level}`;
  badge.textContent = status.label;
  return badge;
}

function renderTable() {
  const projects = filteredProjects();
  elements.projectTableBody.innerHTML = "";
  elements.emptyState.hidden = projects.length > 0;

  for (const project of projects) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <div class="project-title"></div>
      </td>
      <td><div class="field-chip type-chip"></div></td>
      <td>
        <div class="field-chip release-chip"></div>
      </td>
      <td>
        <div class="field-stack people-stack"></div>
      </td>
      <td><div class="field-chip status-chip"></div></td>
      <td><div class="likes-grid"></div></td>
      <td><div class="viral-cell"></div></td>
      <td><button type="button">编辑</button></td>
    `;

    row.children[0].querySelector(".project-title").textContent = project.title;
    row.children[1].querySelector(".field-chip").append(createInlineSelect(project, "type", "type"));
    row.children[2].querySelector(".field-chip").append(createInlineSelect(project, "releaseAccount", "releaseAccount"));
    row.children[3].querySelector(".field-stack").append(createInlineSelect(project, "director", "director"));
    row.children[3].querySelector(".field-stack").append(createInlineSelect(project, "talent", "talent"));
    row.children[4].querySelector(".field-chip").append(createInlineSelect(project, "status", "status"));
    row.children[5].querySelector(".likes-grid").append(
      createLikeInput(project, "douyinLikes", "抖音"),
      createLikeInput(project, "videoLikes", "视频号"),
      createLikeInput(project, "redbookLikes", "小红书"),
    );
    row.children[6].querySelector(".viral-cell").append(createViralBadge(project));
    row.children[7].querySelector("button").addEventListener("click", () => openEditor(project.id));
    elements.projectTableBody.append(row);
  }
}

function monthLabel(date) {
  return `${date.getFullYear()}年 ${date.getMonth() + 1}月`;
}

function openQuickAdd(dateText) {
  state.quickAddDate = dateText;
  elements.quickAddTitle.textContent = `${dateText} ${getWeekday(dateText)}`;
  elements.quickAddDialog.showModal();
}

function eventKindLabel(kind) {
  if (kind === "shoot") return "拍摄";
  if (kind === "edit") return "剪辑";
  return "发布";
}

function eventProjectMeta(project, kind) {
  if (!project) return "";
  if (kind === "shoot") {
    return [project.type, project.director, project.talent].filter(Boolean).join(" · ");
  }
  if (kind === "edit") {
    return [project.type, project.director, project.status].filter(Boolean).join(" · ");
  }
  return [project.releaseAccount, project.releaseStatus].filter(Boolean).join(" · ");
}

function updateProjectFromDrop(projectId, kind, sourceDate, targetDate) {
  const index = state.projects.findIndex((project) => project.id === projectId);
  if (index < 0) return;

  state.projects[index] = rescheduleProjectDate(state.projects[index], kind, sourceDate, targetDate);
  saveProjects();
  render();
}

function renderCalendar() {
  const year = state.calendarDate.getFullYear();
  const month = state.calendarDate.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const events = buildCalendarEvents(filteredProjects());

  elements.calendarTitle.textContent = monthLabel(state.calendarDate);
  elements.calendarGrid.innerHTML = "";

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dateText = isoFromDate(date);
    const cell = document.createElement("button");
    cell.className = `calendar-day${date.getMonth() === month ? "" : " outside"}`;
    cell.type = "button";
    cell.addEventListener("click", () => openQuickAdd(dateText));
    cell.addEventListener("dragover", (event) => {
      event.preventDefault();
      cell.classList.add("drop-target");
    });
    cell.addEventListener("dragleave", () => {
      cell.classList.remove("drop-target");
    });
    cell.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      cell.classList.remove("drop-target");
      const payloadText = event.dataTransfer.getData("application/json");
      if (!payloadText) return;
      const payload = JSON.parse(payloadText);
      updateProjectFromDrop(payload.projectId, payload.kind, payload.sourceDate, dateText);
    });

    const dayNumber = document.createElement("span");
    dayNumber.className = "day-number";
    dayNumber.textContent = String(date.getDate());
    cell.append(dayNumber);

    for (const event of events.filter((item) => item.date === dateText)) {
      const eventButton = document.createElement("span");
      eventButton.draggable = true;
      const project = state.projects.find((item) => item.id === event.projectId);
      eventButton.className = `calendar-event event-${event.kind} project-color-${projectColorIndex(project, 8)}`;
      eventButton.innerHTML = `
        <span class="event-label"></span>
        <strong></strong>
        <small></small>
      `;
      eventButton.querySelector(".event-label").textContent = eventKindLabel(event.kind);
      eventButton.querySelector("strong").textContent = project?.title || event.title.replace(/^拍摄 |^剪辑 |^发布 /, "");
      eventButton.querySelector("small").textContent = eventProjectMeta(project, event.kind);
      eventButton.addEventListener("dragstart", (dragEvent) => {
        dragEvent.stopPropagation();
        eventButton.classList.add("dragging");
        dragEvent.dataTransfer.effectAllowed = "move";
        dragEvent.dataTransfer.setData("application/json", JSON.stringify({
          projectId: event.projectId,
          kind: event.kind,
          sourceDate: event.date,
        }));
      });
      eventButton.addEventListener("dragend", () => {
        eventButton.classList.remove("dragging");
      });
      eventButton.addEventListener("click", (clickEvent) => {
        clickEvent.stopPropagation();
        openEditor(event.projectId);
      });
      cell.append(eventButton);
    }

    elements.calendarGrid.append(cell);
  }
}

function renderView() {
  elements.todayView.classList.toggle("hidden", state.currentView !== "today");
  elements.tableView.classList.toggle("hidden", state.currentView !== "table");
  elements.calendarView.classList.toggle("hidden", state.currentView !== "calendar");
  for (const tab of elements.tabs) {
    tab.classList.toggle("active", tab.dataset.view === state.currentView);
  }
}

function render() {
  renderSummary();
  renderToday();
  renderTable();
  renderCalendar();
  renderView();
}

function isExistingProject(project) {
  return Boolean(project?.id && state.projects.some((item) => item.id === project.id));
}

function refreshOptionControls() {
  const formValues = {
    type: elements.typeInput.value,
    director: elements.directorInput.value,
    talent: elements.talentInput.value,
    status: elements.statusInput.value,
    releaseAccount: elements.releaseAccountInput.value,
  };

  fillFilterSelect(elements.statusFilter, optionList("status"), ALL_STATUS);
  fillFilterSelect(elements.typeFilter, optionList("type"), ALL_TYPES);
  fillFilterSelect(elements.accountFilter, optionList("releaseAccount"), ALL_ACCOUNTS);
  fillManagedSelect(elements.typeInput, "type", formValues.type);
  fillManagedSelect(elements.directorInput, "director", formValues.director);
  fillManagedSelect(elements.talentInput, "talent", formValues.talent);
  fillManagedSelect(elements.statusInput, "status", formValues.status);
  fillSelect(elements.scriptStatusInput, SCRIPT_STATUS_OPTIONS, { selectedValue: elements.scriptStatusInput.value || SCRIPT_STATUS_OPTIONS[0] });
  fillSelect(elements.directorConfirmInput, CONFIRM_STATUS_OPTIONS, { selectedValue: elements.directorConfirmInput.value || CONFIRM_STATUS_OPTIONS[0] });
  fillManagedSelect(elements.releaseAccountInput, "releaseAccount", formValues.releaseAccount);
  fillSelect(elements.releaseStatusInput, RELEASE_STATUS_OPTIONS, { selectedValue: elements.releaseStatusInput.value || RELEASE_STATUS_OPTIONS[0] });
}

function setFormProject(project) {
  const existing = isExistingProject(project);
  elements.projectId.value = project?.id || "";
  elements.titleInput.value = project?.title || "";
  fillManagedSelect(elements.typeInput, "type", project?.type || optionList("type")[0]);
  fillManagedSelect(elements.directorInput, "director", project?.director || optionList("director")[0]);
  fillManagedSelect(elements.talentInput, "talent", project?.talent || optionList("talent")[0]);
  fillManagedSelect(elements.statusInput, "status", project?.status || optionList("status")[0]);
  elements.shootDateInput.value = project?.shootDate || "";
  elements.shootContentInput.value = project?.shootContent || "";
  elements.scriptDocInput.value = project?.scriptDoc || "";
  fillSelect(elements.scriptStatusInput, SCRIPT_STATUS_OPTIONS, { selectedValue: project?.scriptStatus || SCRIPT_STATUS_OPTIONS[0] });
  elements.editStartInput.value = project?.editStartDate || "";
  elements.editEndInput.value = project?.editEndDate || "";
  elements.editContentInput.value = project?.editContent || "";
  fillSelect(elements.directorConfirmInput, CONFIRM_STATUS_OPTIONS, { selectedValue: project?.directorConfirmStatus || CONFIRM_STATUS_OPTIONS[0] });
  elements.releaseDateInput.value = project?.releaseDate || "";
  fillManagedSelect(elements.releaseAccountInput, "releaseAccount", project?.releaseAccount || optionList("releaseAccount")[0]);
  fillSelect(elements.releaseStatusInput, RELEASE_STATUS_OPTIONS, { selectedValue: project?.releaseStatus || RELEASE_STATUS_OPTIONS[0] });
  elements.douyinLikesInput.value = project?.douyinLikes || "";
  elements.videoLikesInput.value = project?.videoLikes || "";
  elements.redbookLikesInput.value = project?.redbookLikes || "";
  elements.notesInput.value = project?.notes || "";
  elements.formError.textContent = "";
  elements.deleteProjectButton.hidden = !existing;
  elements.dialogTitle.textContent = existing ? "编辑片子" : "新增片子";
}

function openEditor(projectOrId = "") {
  const project = typeof projectOrId === "string"
    ? state.projects.find((item) => item.id === projectOrId)
    : projectOrId;
  setFormProject(project);
  elements.dialog.showModal();
}

function readFormProject() {
  const existing = state.projects.find((item) => item.id === elements.projectId.value);
  return createProject({
    ...existing,
    id: elements.projectId.value || undefined,
    title: elements.titleInput.value,
    type: elements.typeInput.value,
    director: elements.directorInput.value,
    talent: elements.talentInput.value,
    status: elements.statusInput.value,
    shootDate: elements.shootDateInput.value,
    shootContent: elements.shootContentInput.value,
    scriptDoc: elements.scriptDocInput.value,
    scriptStatus: elements.scriptStatusInput.value,
    editStartDate: elements.editStartInput.value,
    editEndDate: elements.editEndInput.value,
    editContent: elements.editContentInput.value,
    directorConfirmStatus: elements.directorConfirmInput.value,
    releaseDate: elements.releaseDateInput.value,
    releaseAccount: elements.releaseAccountInput.value,
    releaseStatus: elements.releaseStatusInput.value,
    douyinLikes: elements.douyinLikesInput.value,
    videoLikes: elements.videoLikesInput.value,
    redbookLikes: elements.redbookLikesInput.value,
    notes: elements.notesInput.value,
    createdAt: existing?.createdAt,
  });
}

function saveForm(event) {
  event.preventDefault();
  const project = readFormProject();
  const validation = validateProject(project);

  if (!validation.valid) {
    elements.formError.textContent = validation.errors.join("；");
    return;
  }

  const index = state.projects.findIndex((item) => item.id === project.id);
  if (index >= 0) {
    state.projects[index] = project;
  } else {
    state.projects.unshift(project);
  }

  saveProjects();
  elements.dialog.close();
  render();
}

function deleteCurrentProject() {
  const projectId = elements.projectId.value;
  if (!projectId) return;
  state.projects = state.projects.filter((project) => project.id !== projectId);
  saveProjects();
  elements.dialog.close();
  render();
}

function openDraftFromQuickAdd(kind) {
  const draft = createProjectDraftForDate(state.quickAddDate || todayIso(), kind);
  elements.quickAddDialog.close();
  openEditor(draft);
}

function openArchiveDraft() {
  openEditor(createLibraryProjectDraft());
  elements.dialogTitle.textContent = "新增归档项目";
}

function resolveAddOption(select, key, fallbackValue = "") {
  if (!select.value.startsWith(ADD_PREFIX)) return select.value;

  const name = prompt(`请输入新的${optionConfig[key].label}`);
  if (!name || !name.trim()) {
    select.value = fallbackValue;
    return "";
  }

  const value = addCustomOption(key, name);
  select.value = value;
  return value;
}

function bindManagedSelect(select, key) {
  select.addEventListener("change", () => {
    resolveAddOption(select, key, "");
  });
}

function bindEvents() {
  elements.addProjectButton.addEventListener("click", () => openEditor());
  elements.addArchiveButton.addEventListener("click", openArchiveDraft);
  elements.addTodayButton.addEventListener("click", () => openQuickAdd(todayIso()));
  elements.closeDialogButton.addEventListener("click", () => elements.dialog.close());
  elements.cancelButton.addEventListener("click", () => elements.dialog.close());
  elements.form.addEventListener("submit", saveForm);
  elements.deleteProjectButton.addEventListener("click", deleteCurrentProject);
  elements.closeQuickAddButton.addEventListener("click", () => elements.quickAddDialog.close());
  for (const option of elements.quickOptions) {
    option.addEventListener("click", () => openDraftFromQuickAdd(option.dataset.kind));
  }

  bindManagedSelect(elements.typeInput, "type");
  bindManagedSelect(elements.directorInput, "director");
  bindManagedSelect(elements.talentInput, "talent");
  bindManagedSelect(elements.statusInput, "status");
  bindManagedSelect(elements.releaseAccountInput, "releaseAccount");

  elements.editStartInput.addEventListener("change", () => {
    if (elements.editStartInput.value && !elements.editEndInput.value) {
      elements.editEndInput.value = elements.editStartInput.value;
    }
  });

  elements.searchInput.addEventListener("input", () => {
    state.filters.search = elements.searchInput.value;
    render();
  });
  elements.statusFilter.addEventListener("change", () => {
    state.filters.status = elements.statusFilter.value;
    render();
  });
  elements.typeFilter.addEventListener("change", () => {
    state.filters.type = elements.typeFilter.value;
    render();
  });
  elements.accountFilter.addEventListener("change", () => {
    state.filters.releaseAccount = elements.accountFilter.value;
    render();
  });
  for (const tab of elements.tabs) {
    tab.addEventListener("click", () => {
      state.currentView = tab.dataset.view;
      render();
    });
  }
  elements.prevMonthButton.addEventListener("click", () => {
    state.calendarDate.setMonth(state.calendarDate.getMonth() - 1);
    render();
  });
  elements.nextMonthButton.addEventListener("click", () => {
    state.calendarDate.setMonth(state.calendarDate.getMonth() + 1);
    render();
  });
}

function seedIfEmpty() {
  if (state.projects.length) return;
  const today = todayIso();
  state.projects = [
    createProject({
      title: "样例：今日拍摄",
      type: "商业",
      director: "瑞克",
      talent: "小新",
      shootDate: today,
      shootContent: "产品主视觉和口播段落",
      scriptDoc: "脚本文档链接可填在这里",
      scriptStatus: "已确认",
      editStartDate: today,
      editEndDate: today,
      editContent: "粗剪、精剪、包装字幕",
      directorConfirmStatus: "未确认",
      releaseDate: today,
      releaseAccount: "三楼",
      releaseStatus: "未发布",
      douyinLikes: 3600,
      videoLikes: 800,
      redbookLikes: 1200,
      status: "剪辑中",
      notes: "这是样例项目，可以编辑或删除。",
    }),
  ];
}

function init() {
  state.customOptions = loadOptions();
  state.projects = loadProjects();
  refreshOptionControls();
  bindEvents();
  render();
  syncCloudOnStart();
}

init();
