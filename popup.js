document.addEventListener("DOMContentLoaded", () => {
  const apiKeyInput = document.getElementById("apiKeyInput");
  const saveApiKeyButton = document.getElementById("saveApiKeyButton");
  const apiKeyMessage = document.getElementById("apiKeyMessage");
  const startButton = document.getElementById("startButton");
  const stopButton = document.getElementById("stopButton");
  const currentProcess = document.getElementById("currentProcess");
  const progressBar = document.getElementById("progressBar");
  const detailedStatus = document.getElementById("detailedStatus");
  const logArea = document.getElementById("logArea");

  let isProcessing = false;

  // Load API key from storage
  chrome.storage.local.get(["apiKey", "processingState"], (result) => {
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey;
      apiKeyMessage.textContent = "Đã tải API Key đã lưu.";
      apiKeyMessage.className = "message success";
    }
    if (result.processingState) {
      updateUiFromState(result.processingState);
    }
  });

  saveApiKeyButton.addEventListener("click", () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      chrome.storage.local.set({ apiKey: apiKey }, () => {
        apiKeyMessage.textContent = "Đã lưu API Key!";
        apiKeyMessage.className = "message success";
      });
    } else {
      apiKeyMessage.textContent = "API Key không được để trống.";
      apiKeyMessage.className = "message error";
    }
  });

  startButton.addEventListener("click", async () => {
    if (isProcessing) {
      addLog("Đã có tiến trình đang chạy.", "warning");
      return;
    }
    const { apiKey } = await chrome.storage.local.get("apiKey");
    if (!apiKey) {
      apiKeyMessage.textContent =
        "Vui lòng nhập và lưu API Key trước khi bắt đầu.";
      apiKeyMessage.className = "message error";
      addLog("Thiếu API Key.", "error");
      return;
    }

    isProcessing = true;
    updateUiForProcessing();
    addLog("Bắt đầu tiến trình...", "info");
    chrome.runtime.sendMessage({ type: "START_PROCESS", apiKey: apiKey });
  });

  stopButton.addEventListener("click", () => {
    if (!isProcessing) {
      addLog("Không có tiến trình nào đang chạy để dừng.", "warning");
      return;
    }
    chrome.runtime.sendMessage({ type: "STOP_PROCESS" });
    addLog("Đã gửi yêu cầu dừng...", "info");
  });

  function updateUiForProcessing() {
    startButton.disabled = true;
    stopButton.disabled = false;
    apiKeyInput.disabled = true;
    saveApiKeyButton.disabled = true;
    currentProcess.textContent = "Đang khởi động...";
    progressBar.style.width = "0%";
    progressBar.textContent = "";
    detailedStatus.textContent = "Chờ tín hiệu từ background script...";
  }

  function updateUiForIdle(message = "Chưa hoạt động") {
    isProcessing = false;
    startButton.disabled = false;
    stopButton.disabled = true;
    apiKeyInput.disabled = false;
    saveApiKeyButton.disabled = false;
    currentProcess.textContent = message;
    progressBar.style.width = "0%";
    progressBar.textContent = "";
    detailedStatus.textContent = "-";
  }

  function updateUiFromState(state) {
    isProcessing = state.isProcessing;
    if (isProcessing) {
      updateUiForProcessing();
      currentProcess.textContent = state.currentProcess || "Đang xử lý...";
      progressBar.style.width = state.progress ? state.progress + "%" : "0%";
      progressBar.textContent = state.progress ? state.progress + "%" : "";
      detailedStatus.textContent = state.detailedStatus || "...";
    } else {
      updateUiForIdle(state.currentProcess || "Đã dừng");
    }
    if (
      state.logs &&
      logArea.firstChild &&
      logArea.firstChild.textContent === "Log chi tiết sẽ hiển thị ở đây..."
    ) {
      logArea.innerHTML = ""; // Clear initial message
    }
    if (state.logs) {
      state.logs.forEach((log) => addLog(log.message, log.type, false));
    }
  }

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "UPDATE_STATUS") {
      currentProcess.textContent =
        message.currentProcess || currentProcess.textContent;
      if (message.progress !== undefined) {
        progressBar.style.width = message.progress + "%";
        progressBar.textContent = message.progress + "%";
      }
      detailedStatus.textContent =
        message.detailedStatus || detailedStatus.textContent;
      if (message.log) {
        addLog(message.log.message, message.log.type);
      }

      // Update processing state based on background
      if (message.isProcessing !== undefined) {
        isProcessing = message.isProcessing;
        if (!isProcessing && message.finished) {
          updateUiForIdle(message.currentProcess || "Hoàn thành!");
          addLog(message.currentProcess || "Hoàn thành!", "success");
        } else if (!isProcessing && message.stopped) {
          updateUiForIdle(message.currentProcess || "Đã dừng bởi người dùng.");
          addLog(
            message.currentProcess || "Đã dừng bởi người dùng.",
            "warning"
          );
        } else if (isProcessing) {
          updateUiForProcessing(); // Keep UI in processing state
          // Update texts if provided
          if (message.currentProcess)
            currentProcess.textContent = message.currentProcess;
          if (message.detailedStatus)
            detailedStatus.textContent = message.detailedStatus;
        }
      }
    }
  });

  function addLog(text, type = "info", toBackground = true) {
    if (
      logArea.firstChild &&
      logArea.firstChild.textContent === "Log chi tiết sẽ hiển thị ở đây..."
    ) {
      logArea.innerHTML = ""; // Clear initial message
    }
    const logEntry = document.createElement("p");
    const timestamp = new Date().toLocaleTimeString();
    logEntry.textContent = `[${timestamp}] ${text}`;
    logEntry.className = `log-entry-${type}`;
    logArea.appendChild(logEntry);
    logArea.scrollTop = logArea.scrollHeight; // Auto-scroll to bottom

    if (toBackground) {
      chrome.runtime.sendMessage({
        type: "POPUP_LOG",
        log: { message: text, type: type, timestamp: timestamp },
      });
    }
  }

  //Initial UI state
  updateUiForIdle();
  chrome.runtime.sendMessage({ type: "GET_INITIAL_STATE" });
});
