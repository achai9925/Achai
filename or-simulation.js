const categories = {
  induction: {
    title: "Induction",
    medications: [
      { id: "propofol", name: "Propofol", type: "Emulsion vial" },
      { id: "fentanyl", name: "Fentanyl", type: "Controlled medication" },
      { id: "lidocaine", name: "Lidocaine", type: "Local anesthetic" },
    ],
  },
  paralytic: {
    title: "Neuromuscular blockers",
    medications: [
      { id: "rocuronium", name: "Rocuronium", type: "Neuromuscular blocker" },
    ],
  },
  adjunct: {
    title: "Adjuncts",
    medications: [
      { id: "glycopyrrolate", name: "Glycopyrrolate", type: "Anticholinergic" },
    ],
  },
  reversal: {
    title: "Reversal",
    medications: [
      { id: "sugammadex", name: "Sugammadex", type: "Reversal agent" },
    ],
  },
};

class WaveformCanvas extends HTMLElement {
  connectedCallback() {
    this.canvas = this.querySelector("canvas");
    this.context = this.canvas.getContext("2d");
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this);
    this.active = false;
    this.phase = Math.random();
    this.lastFrame = 0;
    this.resize();
    this.frame = this.frame.bind(this);
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver?.disconnect();
  }

  set connected(value) {
    this.active = value;
    this.classList.toggle("active", value);
    this.canvas?.setAttribute("data-active", String(value));
  }

  resize() {
    if (!this.canvas || !this.context) return;
    const bounds = this.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, bounds.width);
    this.height = Math.max(1, bounds.height);
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  sample(x, width) {
    const kind = this.dataset.waveform;
    const period = kind === "ecg" ? 86 : kind === "spo2" ? 74 : 118;
    const point = ((x + this.phase * period) % period) / period;
    const noise = this.active ? Math.sin(x * 0.81 + this.phase * 22) * 0.65 : 0.25;
    const center = this.height * 0.54;
    const amplitude = Math.max(2, this.height * (this.active ? 0.34 : 0.04));

    if (!this.active) return center + noise;

    if (kind === "ecg") {
      let value = Math.sin(point * Math.PI * 2) * 0.025;
      if (point > 0.14 && point < 0.19) value -= Math.sin((point - 0.14) * Math.PI / 0.05) * 0.18;
      if (point > 0.205 && point < 0.235) value += Math.sin((point - 0.205) * Math.PI / 0.03) * 0.95;
      if (point > 0.24 && point < 0.29) value -= Math.sin((point - 0.24) * Math.PI / 0.05) * 0.28;
      if (point > 0.38 && point < 0.54) value -= Math.sin((point - 0.38) * Math.PI / 0.16) * 0.16;
      return center - value * amplitude + noise;
    }

    if (kind === "spo2") {
      const pulse = Math.exp(-Math.pow((point - 0.29) / 0.12, 2));
      const notch = Math.exp(-Math.pow((point - 0.48) / 0.05, 2));
      return center + amplitude * (0.62 - pulse * 1.25 + notch * 0.2) + noise;
    }

    const cycle = point;
    let value = 0;
    if (cycle > 0.2 && cycle < 0.55) value = 1;
    else if (cycle >= 0.55 && cycle < 0.72) value = 1 - (cycle - 0.55) / 0.17;
    else if (cycle >= 0.72) value = 0.04;
    return center + amplitude * (0.55 - value * 0.95) + noise * 0.25;
  }

  frame(timestamp) {
    if (!this.context || !this.width) {
      this.animationFrame = requestAnimationFrame(this.frame);
      return;
    }

    const elapsed = this.lastFrame ? Math.min(timestamp - this.lastFrame, 50) : 16;
    this.lastFrame = timestamp;
    if (!document.hidden) {
      this.phase = (this.phase + elapsed * (this.active ? 0.055 : 0.02)) % 10000;
      this.draw();
    }
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  draw() {
    const context = this.context;
    const kind = this.dataset.waveform;
    const color = kind === "ecg" ? "#00e18a" : kind === "spo2" ? "#10d9ed" : "#f4dc00";
    const center = this.height * 0.54;
    context.clearRect(0, 0, this.width, this.height);
    context.strokeStyle = "#172023";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, center);
    context.lineTo(this.width, center);
    context.stroke();
    context.beginPath();
    for (let x = 0; x <= this.width; x += 1) {
      const y = this.sample(x, this.width);
      if (x === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.strokeStyle = this.active ? color : "#43504f";
    context.lineWidth = this.active ? 1.8 : 1;
    context.shadowColor = this.active ? color : "transparent";
    context.shadowBlur = this.active ? 6 : 0;
    context.stroke();
    context.shadowBlur = 0;
    if (this.active) {
      const sweepX = (this.phase * 7) % this.width;
      const gradient = context.createLinearGradient(sweepX - 15, 0, sweepX + 7, 0);
      gradient.addColorStop(0, "transparent");
      gradient.addColorStop(1, "#e8fff62c");
      context.fillStyle = gradient;
      context.fillRect(sweepX - 15, 0, 22, this.height);
    }
  }
}

customElements.define("waveform-canvas", WaveformCanvas);

class PatientCanvas extends HTMLElement {
  connectedCallback() {
    this.figure = this.querySelector("[data-patient-figure]");
    this.emptyState = this.querySelector("[data-empty-patient]");
    this.zones = [...this.querySelectorAll("[data-zone]")];
    this.zones.forEach((zone) => {
      zone.addEventListener("click", () => this.dispatchZone(zone.dataset.zone));
      zone.addEventListener("dragover", (event) => {
        if (!this.simulation?.draggedSensor) return;
        event.preventDefault();
        zone.classList.add("drag-over");
      });
      zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
      zone.addEventListener("drop", (event) => {
        event.preventDefault();
        zone.classList.remove("drag-over");
        const sensor = event.dataTransfer?.getData("text/sensor") || this.simulation?.draggedSensor;
        if (sensor) this.dispatchEvent(new CustomEvent("sensor-connect", { detail: { sensor, zone: zone.dataset.zone }, bubbles: true }));
      });
    });
  }

  set simulation(value) {
    this._simulation = value;
  }

  get simulation() {
    return this._simulation;
  }

  set occupied(value) {
    this.figure.hidden = !value;
    this.emptyState.hidden = value;
    this.figure.classList.toggle("patient-ready", value);
    this.zones.forEach((zone) => { zone.disabled = !value; });
  }

  dispatchZone(zone) {
    if (this.simulation?.selectedSensor) {
      this.dispatchEvent(new CustomEvent("sensor-connect", {
        detail: { sensor: this.simulation.selectedSensor, zone },
        bubbles: true,
      }));
    }
  }

  setConnection(sensor, connected) {
    const zoneName = { ecg: "chest", spo2: "finger", nibp: "arm", etco2: "airway" }[sensor];
    const zone = this.zones.find((item) => item.dataset.zone === sensor);
    const mark = this.querySelector(`[data-mark="${zoneName}"]`);
    const wire = this.querySelector(`[data-wire="${sensor}"]`);
    zone?.classList.toggle("connected", connected);
    mark?.classList.toggle("attached", connected);
    wire?.classList.toggle("is-live", connected);
  }
}

customElements.define("patient-canvas", PatientCanvas);

class OperatingBed extends HTMLElement {
  connectedCallback() {
    this.patientCanvas = this.querySelector("patient-canvas");
    this.bringButton = this.querySelector("[data-bring-patient]");
    this.bringButton.addEventListener("click", () => {
      this.patientCanvas.occupied = true;
      this.bringButton.disabled = true;
      this.querySelector("[data-patient-state]").textContent = "PATIENT IN ROOM";
      this.querySelector("[data-patient-state]").classList.add("ready");
      this.querySelector("[data-bed-title]").textContent = "Patient in room";
      this.querySelector("[data-bed-copy]").textContent = "Connect each monitor sensor to activate its display.";
      this.hint("Select a monitor cable, then place it on the highlighted matching area.");
    });

    this.querySelector("[data-med-tray]").addEventListener("dragover", (event) => {
      if (!this.simulation?.draggedMedication) return;
      event.preventDefault();
      event.currentTarget.classList.add("drag-over");
    });
    this.querySelector("[data-med-tray]").addEventListener("dragleave", (event) => event.currentTarget.classList.remove("drag-over"));
    this.querySelector("[data-med-tray]").addEventListener("drop", (event) => {
      event.preventDefault();
      event.currentTarget.classList.remove("drag-over");
      const medication = event.dataTransfer?.getData("text/medication") || this.simulation?.draggedMedication;
      if (medication) this.dispatchEvent(new CustomEvent("medication-place", { detail: { medication }, bubbles: true }));
    });
  }

  set simulation(value) {
    this._simulation = value;
  }

  get simulation() {
    return this._simulation;
  }

  hint(message) {
    this.querySelector("[data-interaction-hint]").textContent = message;
  }

  reset() {
    this.patientCanvas.occupied = false;
    this.bringButton.disabled = false;
    this.querySelector("[data-patient-state]").textContent = "ROOM READY";
    this.querySelector("[data-patient-state]").classList.remove("ready");
    this.querySelector("[data-bed-title]").textContent = "Patient not yet in room";
    this.querySelector("[data-bed-copy]").textContent = "Set up the room before starting the case.";
    this.hint("Bring the patient to the room to enable placement targets.");
  }
}

customElements.define("operating-bed", OperatingBed);

class AnesthesiaMonitor extends HTMLElement {
  connectedCallback() {
    this.clock = this.querySelector("[data-clock]");
    this.clockTimer = window.setInterval(() => {
      this.clock.textContent = new Date().toLocaleTimeString([], { hour12: false });
    }, 1000);
    this.sensorHandles = [...this.querySelectorAll("[data-sensor]")];
    this.sensorHandles.forEach((handle) => {
      handle.addEventListener("dragstart", (event) => {
        this.simulation.draggedSensor = handle.dataset.sensor;
        event.dataTransfer?.setData("text/sensor", handle.dataset.sensor);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
      });
      handle.addEventListener("dragend", () => { this.simulation.draggedSensor = null; });
      handle.addEventListener("click", () => this.simulation.selectSensor(handle.dataset.sensor));
    });
    this.querySelector("[data-cycle]").addEventListener("click", () => this.simulation.cyclePressure());
  }

  disconnectedCallback() {
    window.clearInterval(this.clockTimer);
  }

  set simulation(value) {
    this._simulation = value;
  }

  get simulation() {
    return this._simulation;
  }

  setConnected(sensor, connected, cycling = false) {
    const handle = this.sensorHandles.find((item) => item.dataset.sensor === sensor);
    const status = this.querySelector(`[data-sensor-status="${sensor}"]`);
    const cableState = this.querySelector(`[data-cable-state="${sensor}"]`);
    const waveform = this.querySelector(`[data-waveform="${sensor}"]`);
    handle?.classList.toggle("connected", connected);
    handle?.setAttribute("aria-pressed", String(this.simulation.selectedSensor === sensor));
    if (cableState) cableState.textContent = connected ? "Connected" : "Connect";
    if (waveform) waveform.connected = connected;
    if (status) {
      status.textContent = cycling
        ? "CUFF CYCLING"
        : connected
          ? { ecg: "LEAD II · CONNECTED", spo2: "PROBE CONNECTED", nibp: "CUFF CONNECTED", etco2: "SAMPLE LINE CONNECTED" }[sensor]
          : { ecg: "NO SENSOR", spo2: "DISCONNECTED", nibp: "NO SENSOR", etco2: "NO SAMPLE LINE" }[sensor];
    }
    if (sensor === "nibp") {
      this.querySelector("[data-cycle]").disabled = !connected || cycling;
      this.querySelector("[data-nibp-cycle]").hidden = !cycling;
    }
    if (sensor === "nibp" && !connected) this.querySelector("[data-reading='nibp']").textContent = "--/--";
    if (sensor === "nibp" && !connected) this.querySelector(".parameter-nibp .numeric-value > span").innerHTML = "mmHg <small>(MAP --)</small>";
  }

  setReading(name, value) {
    const output = this.querySelector(`[data-reading="${name}"]`);
    if (output) output.textContent = value;
  }

  setStandby(standby) {
    this.querySelector("[data-monitor-state]").textContent = standby ? "STANDBY" : "MONITORING";
  }
}

customElements.define("anesthesia-monitor", AnesthesiaMonitor);

class PyxisStation extends HTMLElement {
  connectedCallback() {
    this.authenticated = false;
    this.selectedCategory = null;
    this.selectedMedications = new Set();
    this.preparedItems = new Map();
    this.placedItems = new Set();
    this.idCounter = 0;
    this.querySelector("[data-authenticate]").addEventListener("click", () => this.authenticate());
    this.drawerButtons = [...this.querySelectorAll("[data-category]")];
    this.drawerButtons.forEach((button) => button.addEventListener("click", () => this.openDrawer(button.dataset.category)));
    this.querySelector("[data-prepare]").addEventListener("click", () => this.prepare());
    this.querySelector("[data-medication-list]").addEventListener("click", (event) => {
      const button = event.target.closest("[data-medication]");
      if (button) this.toggleMedication(button.dataset.medication);
    });
  }

  set simulation(value) {
    this._simulation = value;
  }

  get simulation() {
    return this._simulation;
  }

  authenticate() {
    this.authenticated = true;
    this.querySelector("[data-auth-title]").textContent = "Training session active";
    this.querySelector("[data-auth-copy]").textContent = "Mock station unlocked. No credentials collected.";
    this.querySelector("[data-authenticate]").textContent = "Session active";
    this.querySelector("[data-authenticate]").disabled = true;
    this.querySelector("[data-lock-indicator]").textContent = "UNLOCKED";
    this.querySelector("[data-lock-indicator]").classList.add("unlocked");
    this.drawerButtons.forEach((button) => { button.disabled = false; });
    this.querySelector("[data-drawer-title]").textContent = "Choose a drawer";
    this.querySelector("[data-drawer-message]").textContent = "Select a drawer to view mock medication labels. No doses are displayed.";
    this.querySelector("[data-drawer-bank]").classList.add("unlocked");
  }

  openDrawer(category) {
    if (!this.authenticated) return;
    this.selectedCategory = category;
    this.selectedMedications.clear();
    const drawer = categories[category];
    this.drawerButtons.forEach((button) => button.classList.toggle("active", button.dataset.category === category));
    this.querySelector("[data-drawer-kicker]").textContent = "Mock medication drawer";
    this.querySelector("[data-drawer-title]").textContent = drawer.title;
    this.querySelector("[data-drawer-message]").textContent = "Select items to prepare. Educational labels only; no doses or administration instructions.";
    const list = this.querySelector("[data-medication-list]");
    list.replaceChildren(...drawer.medications.map((medication) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "med-option";
      button.dataset.medication = medication.id;
      button.setAttribute("aria-pressed", "false");
      button.innerHTML = `<strong>${medication.name}</strong><small>${medication.type}</small>`;
      return button;
    }));
    this.updateSelection();
  }

  toggleMedication(id) {
    if (this.selectedMedications.has(id)) this.selectedMedications.delete(id);
    else this.selectedMedications.add(id);
    this.querySelectorAll("[data-medication]").forEach((button) => {
      button.setAttribute("aria-pressed", String(this.selectedMedications.has(button.dataset.medication)));
    });
    this.updateSelection();
  }

  updateSelection() {
    const count = this.selectedMedications.size;
    this.querySelector("[data-selection-count]").textContent = `${count} selected`;
    this.querySelector("[data-prepare]").disabled = count === 0;
  }

  prepare() {
    for (const id of this.selectedMedications) {
      const medication = Object.values(categories).flatMap((category) => category.medications).find((item) => item.id === id);
      if (!medication) continue;
      const key = `med-${++this.idCounter}`;
      this.preparedItems.set(key, medication);
      this.renderPreparedItem(key, medication);
    }
    this.selectedMedications.clear();
    this.querySelectorAll("[data-medication]").forEach((button) => button.setAttribute("aria-pressed", "false"));
    this.updateSelection();
    this.querySelector("[data-prepared-hint]").hidden = this.preparedItems.size > 0;
    this.querySelector("[data-prepared-count]").textContent = String(this.preparedItems.size);
    this.querySelector("[data-drawer-message]").textContent = "Mock items prepared. Drag a syringe into the medication tray.";
  }

  renderPreparedItem(key, medication) {
    const item = document.createElement("div");
    item.className = "prepared-item";
    item.draggable = true;
    item.dataset.preparedId = key;
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.setAttribute("aria-label", `Drag mock ${medication.name} syringe to the medication tray`);
    item.innerHTML = `<span class="syringe-icon" aria-hidden="true"></span><span><strong>${medication.name}</strong><small>MOCK SYRINGE</small></span>`;
    item.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      this.placeMedication(key);
    });
    item.addEventListener("dragstart", (event) => {
      this.simulation.draggedMedication = key;
      event.dataTransfer?.setData("text/medication", key);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });
    item.addEventListener("dragend", () => { this.simulation.draggedMedication = null; });
    this.querySelector("[data-prepared-list]").append(item);
  }

  placeMedication(key) {
    const medication = this.preparedItems.get(key);
    if (!medication || this.placedItems.has(key)) return;
    this.placedItems.add(key);
    const item = document.createElement("span");
    item.className = "tray-medication";
    item.textContent = `${medication.name} · mock`;
    this.simulation.bed.querySelector("[data-tray-items]").append(item);
    this.querySelector(`[data-prepared-id="${key}"]`)?.remove();
    this.querySelector("[data-prepared-count]").textContent = String(this.preparedItems.size - this.placedItems.size);
    this.querySelector("[data-prepared-hint]").hidden = this.preparedItems.size > this.placedItems.size;
  }

  reset() {
    this.authenticated = false;
    this.selectedCategory = null;
    this.selectedMedications.clear();
    this.preparedItems.clear();
    this.placedItems.clear();
    this.idCounter = 0;
    this.querySelector("[data-auth-title]").textContent = "Station locked";
    this.querySelector("[data-auth-copy]").textContent = "Authenticate to open medication drawers.";
    this.querySelector("[data-authenticate]").textContent = "Mock sign in";
    this.querySelector("[data-authenticate]").disabled = false;
    this.querySelector("[data-lock-indicator]").textContent = "LOCKED";
    this.querySelector("[data-lock-indicator]").classList.remove("unlocked");
    this.drawerButtons.forEach((button) => { button.disabled = true; button.classList.remove("active"); });
    this.querySelector("[data-drawer-kicker]").textContent = "Select a drawer";
    this.querySelector("[data-drawer-title]").textContent = "Locked cabinet";
    this.querySelector("[data-drawer-message]").textContent = "Authenticate to browse mock medication labels.";
    this.querySelector("[data-medication-list]").replaceChildren();
    this.querySelector("[data-prepare]").disabled = true;
    this.querySelector("[data-selection-count]").textContent = "0 selected";
    this.querySelector("[data-prepared-list]").replaceChildren();
    this.querySelector("[data-prepared-hint]").hidden = false;
    this.querySelector("[data-prepared-count]").textContent = "0";
  }
}

customElements.define("pyxis-station", PyxisStation);

class ORSimulation {
  constructor() {
    this.pyxis = document.querySelector("pyxis-station");
    this.bed = document.querySelector("operating-bed");
    this.monitor = document.querySelector("anesthesia-monitor");
    this.patient = this.bed.querySelector("patient-canvas");
    this.connections = { ecg: false, spo2: false, nibp: false, etco2: false };
    this.selectedSensor = null;
    this.draggedSensor = null;
    this.draggedMedication = null;
    this.nibpTimer = null;
    this.bindEvents();
  }

  bindEvents() {
    this.pyxis.simulation = this;
    this.bed.simulation = this;
    this.monitor.simulation = this;
    this.patient.simulation = this;
    this.patient.addEventListener("sensor-connect", (event) => this.connectSensor(event.detail.sensor, event.detail.zone));
    this.bed.addEventListener("medication-place", (event) => this.pyxis.placeMedication(event.detail.medication));
    this.bed.querySelector("[data-reset]").addEventListener("click", () => this.reset());
    this.monitor.sensorHandles.forEach((handle) => handle.addEventListener("dragstart", () => {
      this.bed.hint("Drop the sensor on its matching highlighted body zone.");
    }));
  }

  selectSensor(sensor) {
    if (!this.bed.patientCanvas.figure.classList.contains("patient-ready")) {
      this.bed.hint("Bring the patient into the OR before placing monitor sensors.");
      return;
    }
    if (this.selectedSensor === sensor) {
      this.selectedSensor = null;
      this.monitor.sensorHandles.forEach((handle) => {
        handle.setAttribute("aria-pressed", "false");
        handle.classList.remove("selected");
      });
      this.bed.hint("Sensor selection cleared.");
      return;
    }
    this.selectedSensor = sensor;
    this.monitor.sensorHandles.forEach((handle) => {
      const selected = handle.dataset.sensor === sensor;
      handle.setAttribute("aria-pressed", String(selected));
      handle.classList.toggle("selected", selected);
    });
    const target = { ecg: "chest", spo2: "index finger", nibp: "upper arm", etco2: "airway" }[sensor];
    this.bed.hint(`Selected ${sensor.toUpperCase()}. Tap the highlighted ${target} zone to connect.`);
  }

  connectSensor(sensor, zone) {
    const expected = { ecg: "ecg", spo2: "spo2", nibp: "nibp", etco2: "etco2" }[sensor];
    if (expected !== zone) {
      this.bed.hint(`That sensor does not match this area. Place ${sensor.toUpperCase()} on its labeled target.`);
      return;
    }
    if (!this.bed.patientCanvas.figure.classList.contains("patient-ready")) {
      this.bed.hint("Bring the patient into the OR before placing monitor sensors.");
      return;
    }
    if (this.connections[sensor]) {
      this.bed.hint(`${sensor.toUpperCase()} is already connected.`);
      return;
    }
    this.connections[sensor] = true;
    this.patient.setConnection(sensor, true);
    this.monitor.setConnected(sensor, true);
    this.monitor.setStandby(false);
    const readingBySensor = {
      ecg: [["hr", "73"]],
      spo2: [["spo2", "99"]],
      nibp: [],
      etco2: [["etco2", "38"], ["rr", "12"]],
    };
    readingBySensor[sensor].forEach(([name, value]) => this.monitor.setReading(name, value));
    this.selectedSensor = null;
    this.monitor.sensorHandles.forEach((handle) => {
      handle.setAttribute("aria-pressed", "false");
      handle.classList.remove("selected");
    });
    this.bed.hint(`${sensor.toUpperCase()} connected. Monitor display updated.`);
    if (sensor === "nibp") this.cyclePressure();
  }

  cyclePressure() {
    if (!this.connections.nibp || this.nibpTimer) return;
    this.monitor.setConnected("nibp", true, true);
    this.monitor.setReading("nibp", "--/--");
    this.monitor.querySelector(".parameter-nibp .numeric-value > span").innerHTML = "mmHg <small>(MAP --)</small>";
    this.nibpTimer = window.setTimeout(() => {
      this.monitor.setConnected("nibp", true, false);
      this.monitor.setReading("nibp", "122/78");
      this.monitor.querySelector(".parameter-nibp .numeric-value > span").innerHTML = "mmHg <small>(MAP 93)</small>";
      this.nibpTimer = null;
    }, 2200);
  }

  reset() {
    window.clearTimeout(this.nibpTimer);
    this.nibpTimer = null;
    this.connections = { ecg: false, spo2: false, nibp: false, etco2: false };
    this.selectedSensor = null;
    this.draggedSensor = null;
    this.draggedMedication = null;
    this.monitor.sensorHandles.forEach((handle) => {
      handle.classList.remove("selected", "connected");
      handle.setAttribute("aria-pressed", "false");
    });
    Object.keys(this.connections).forEach((sensor) => {
      this.patient.setConnection(sensor, false);
      this.monitor.setConnected(sensor, false);
    });
    [["hr", "--"], ["spo2", "--"], ["nibp", "--/--"], ["etco2", "--"], ["rr", "--"]].forEach(([name, value]) => this.monitor.setReading(name, value));
    this.monitor.querySelector(".parameter-nibp .numeric-value > span").innerHTML = "mmHg <small>(MAP --)</small>";
    this.monitor.setStandby(true);
    this.bed.reset();
    this.pyxis.reset();
    this.bed.querySelector("[data-tray-items]").replaceChildren();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.orSimulation = new ORSimulation();
});
