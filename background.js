let processingTabId = null;
let globalApiKey = null;
let stopProcessingFlag = false;
let overallProcessActive = false;
let currentStage = ""; // 'autolearn', 'autoquiz'
let processingState = {
  isProcessing: false,
  currentProcess: "Chưa hoạt động",
  progress: 0,
  detailedStatus: "-",
  logs: [],
};

const MAX_LOGS = 50;

function updateProcessingState(newState) {
  processingState = { ...processingState, ...newState };
  chrome.storage.local.set({ processingState: processingState });
  // Gửi thông điệp cập nhật tới popup nếu nó đang mở
  try {
    chrome.runtime.sendMessage({
      type: "UPDATE_STATUS",
      ...processingState,
    });
  } catch (error) {
    // Popup có thể không mở, không sao
    console.log("Popup not open or error sending message:", error.message);
  }
}

function addLogToState(message, type = "info") {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = { message: `[BG] ${message}`, type, timestamp };
  processingState.logs.push(logEntry);
  if (processingState.logs.length > MAX_LOGS) {
    processingState.logs.shift(); // Giữ cho log không quá dài
  }
  updateProcessingState({ logs: processingState.logs });
  console.log(`[${type.toUpperCase()}] ${message}`);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "START_PROCESS") {
    if (overallProcessActive) {
      addLogToState("Tiến trình đã đang chạy.", "warning");
      sendResponse({ success: false, message: "Tiến trình đã đang chạy." });
      return true;
    }
    globalApiKey = message.apiKey;
    stopProcessingFlag = false;
    overallProcessActive = true;
    processingState.logs = []; // Reset logs
    addLogToState("Nhận lệnh START_PROCESS", "info");
    updateProcessingState({
      isProcessing: true,
      currentProcess: "Đang tìm tab Coursera...",
      progress: 0,
      detailedStatus: "Vui lòng đảm bảo bạn đang ở trang Coursera.",
    });
    startFullProcess();
    sendResponse({ success: true });
    return true;
  } else if (message.type === "STOP_PROCESS") {
    addLogToState("Nhận lệnh STOP_PROCESS", "info");
    stopProcessingFlag = true;
    overallProcessActive = false;
    updateProcessingState({
      isProcessing: false,
      currentProcess: "Đang dừng...",
      detailedStatus: "Người dùng yêu cầu dừng.",
      stopped: true,
    });
    if (processingTabId) {
      try {
        chrome.tabs.sendMessage(processingTabId, { type: "STOP_SCRIPT" });
      } catch (e) {
        addLogToState(
          "Lỗi khi gửi lệnh dừng tới content script: " + e.message,
          "error"
        );
      }
    }
    sendResponse({ success: true });
    return true;
  } else if (message.type === "AUTOLERN_PROGRESS") {
    updateProcessingState({
      progress: message.progress,
      detailedStatus: message.status,
      currentProcess: "Autolearn: " + message.currentTask,
    });
    addLogToState(
      `Autolearn: ${message.currentTask} - ${message.status} (${message.progress}%)`,
      "info"
    );
    return true;
  } else if (message.type === "AUTOLERN_DONE") {
    addLogToState("Autolearn hoàn thành!", "success");
    updateProcessingState({
      progress: 100,
      detailedStatus: "Autolearn hoàn thành. Chuẩn bị Autoquiz...",
      currentProcess: "Autolearn Hoàn tất",
    });
    if (!stopProcessingFlag) {
      currentStage = "autoquiz";
      executeAutoQuiz(processingTabId, globalApiKey);
    } else {
      overallProcessActive = false;
      updateProcessingState({
        isProcessing: false,
        currentProcess: "Đã dừng sau Autolearn",
        finished: true,
      });
    }
    return true;
  } else if (message.type === "AUTOQUIZ_LOG") {
    // Log này từ content_autoquiz, thêm tiền tố để phân biệt
    const logMessage = `Autoquiz: ${message.log.message}`;
    addLogToState(logMessage, message.log.type);
    updateProcessingState({
      detailedStatus: message.log.message, // Cập nhật status chi tiết bằng log gần nhất từ autoquiz
      currentProcess: "Autoquiz đang chạy",
    });
    return true;
  } else if (message.type === "AUTOQUIZ_PROGRESS") {
    updateProcessingState({
      // Autoquiz có thể không có % tổng thể, chỉ cập nhật trạng thái
      detailedStatus: message.status,
      currentProcess: "Autoquiz: " + message.currentTask,
    });
    addLogToState(
      `Autoquiz: ${message.currentTask} - ${message.status}`,
      "info"
    );
    return true;
  } else if (message.type === "AUTOQUIZ_DONE") {
    addLogToState("Autoquiz hoàn thành!", "success");
    overallProcessActive = false;
    updateProcessingState({
      isProcessing: false,
      progress: 100, // Coi như hoàn thành toàn bộ
      detailedStatus: "Autoquiz hoàn thành!",
      currentProcess: "Tất cả đã hoàn tất!",
      finished: true,
    });
    return true;
  } else if (message.type === "PROCESS_ERROR") {
    addLogToState(
      `Lỗi trong quá trình ${message.stage}: ${message.error}`,
      "error"
    );
    overallProcessActive = false;
    updateProcessingState({
      isProcessing: false,
      currentProcess: `Lỗi ${message.stage}`,
      detailedStatus: message.error,
      finished: true, // Coi như kết thúc dù lỗi
    });
    return true;
  } else if (message.type === "POPUP_LOG") {
    // Log này từ popup, thêm tiền tố và không broadcast lại cho popup
    console.log(
      `[POPUP/${message.log.type.toUpperCase()}] ${message.log.message}`
    );
    // Chỉ lưu vào state để nếu popup mở lại thì thấy
    const logEntry = {
      message: `[POPUP] ${message.log.message}`,
      type: message.log.type,
      timestamp: message.log.timestamp,
    };
    processingState.logs.push(logEntry);
    if (processingState.logs.length > MAX_LOGS) {
      processingState.logs.shift();
    }
    chrome.storage.local.set({
      processingState: { ...processingState, logs: processingState.logs },
    });
    return true;
  } else if (message.type === "GET_INITIAL_STATE") {
    sendResponse(processingState);
    return true;
  }
  return false; // Cho các listener khác nếu không xử lý
});

async function startFullProcess() {
  currentStage = "autolearn";
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0 || !tabs[0].url.includes("coursera.org")) {
      addLogToState("Không tìm thấy tab Coursera đang hoạt động.", "error");
      updateProcessingState({
        isProcessing: false,
        currentProcess: "Lỗi: Không có tab Coursera",
        detailedStatus: "Vui lòng mở một tab Coursera và thử lại.",
        finished: true,
      });
      overallProcessActive = false;
      return;
    }
    processingTabId = tabs[0].id;
    addLogToState(`Bắt đầu Autolearn trên tab ID: ${processingTabId}`, "info");
    updateProcessingState({
      currentProcess: "Đang chạy Autolearn...",
      detailedStatus: "Injecting Autolearn script...",
    });
    executeAutoLearn(processingTabId);
  });
}

async function executeAutoLearn(tabId) {
  if (stopProcessingFlag) {
    addLogToState("Autolearn bị hủy do người dùng yêu cầu dừng.", "warning");
    overallProcessActive = false;
    updateProcessingState({
      isProcessing: false,
      currentProcess: "Đã dừng Autolearn",
      finished: true,
    });
    return;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content_autolearn.js"],
    });
    addLogToState("Đã inject content_autolearn.js", "info");
    // content_autolearn.js sẽ tự chạy và gửi message khi hoàn thành hoặc có tiến trình
  } catch (e) {
    addLogToState(`Lỗi khi inject content_autolearn.js: ${e.message}`, "error");
    overallProcessActive = false;
    updateProcessingState({
      isProcessing: false,
      currentProcess: "Lỗi Autolearn",
      detailedStatus: e.message,
      finished: true,
    });
  }
}

async function executeAutoQuiz(tabId, apiKey) {
  if (stopProcessingFlag) {
    addLogToState("Autoquiz bị hủy do người dùng yêu cầu dừng.", "warning");
    overallProcessActive = false;
    updateProcessingState({
      isProcessing: false,
      currentProcess: "Đã dừng Autoquiz",
      finished: true,
    });
    return;
  }
  addLogToState(`Bắt đầu Autoquiz trên tab ID: ${tabId}`, "info");
  updateProcessingState({
    currentProcess: "Đang chạy Autoquiz...",
    progress: 0, // Reset progress cho giai đoạn mới (nếu cần)
    detailedStatus: "Injecting Autoquiz script...",
  });
  try {
    // Inject improved_autoquiz.js trước (nó là một IIFE, sẽ không chạy ngay)
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content_autoquiz.js"],
    });
    addLogToState("Đã inject content_autoquiz.js", "info");

    // Sau đó gọi hàm chính trong đó với API key
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (apiKeyForQuiz) => {
        // Giả sử content_autoquiz.js định nghĩa một hàm global hoặc trong một namespace
        // mà bạn có thể gọi, ví dụ: window.runAutoQuizScript(apiKeyForQuiz)
        // Vì improved_autoquiz.js là một IIFE, nó sẽ tự chạy khi được inject.
        // Chúng ta cần sửa đổi nó để nhận API key.
        // Tạm thời, ta sẽ gửi message chứa API key để content script lắng nghe
        window.postMessage(
          { type: "COURSERA_AUTOQUIZ_API_KEY", apiKey: apiKeyForQuiz },
          "*"
        );
        // Nếu improved_autoquiz.js được sửa để có hàm khởi tạo, thì gọi ở đây:
        // ví dụ: if (typeof window.startCourseraAutoQuiz === 'function') {
        //          window.startCourseraAutoQuiz(apiKeyForQuiz);
        //        } else { console.error('startCourseraAutoQuiz function not found'); }
      },
      args: [apiKey],
    });
    addLogToState("Đã gửi API key và yêu cầu chạy Autoquiz script.", "info");
  } catch (e) {
    addLogToState(
      `Lỗi khi inject/chạy content_autoquiz.js: ${e.message}`,
      "error"
    );
    overallProcessActive = false;
    updateProcessingState({
      isProcessing: false,
      currentProcess: "Lỗi Autoquiz",
      detailedStatus: e.message,
      finished: true,
    });
  }
}

// Khôi phục trạng thái khi extension khởi động (ví dụ sau khi trình duyệt cập nhật)
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get("processingState", (result) => {
    if (result.processingState) {
      // Nếu đang xử lý dở dang, có thể reset về idle hoặc thông báo lỗi
      if (result.processingState.isProcessing) {
        result.processingState.isProcessing = false;
        result.processingState.currentProcess =
          "Đã dừng do extension khởi động lại";
        result.processingState.detailedStatus = "Vui lòng bắt đầu lại nếu cần.";
      }
      processingState = result.processingState;
      addLogToState(
        "Khôi phục trạng thái từ storage sau khi khởi động.",
        "info"
      );
    } else {
      // Khởi tạo nếu chưa có gì trong storage
      updateProcessingState({
        isProcessing: false,
        currentProcess: "Chưa hoạt động",
        progress: 0,
        detailedStatus: "-",
        logs: [],
      });
    }
  });
});

// Xử lý khi extension được cài đặt hoặc cập nhật
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    addLogToState("Extension đã được cài đặt. Chào mừng!", "success");
  } else if (details.reason === "update") {
    addLogToState(
      `Extension đã được cập nhật lên phiên bản ${
        chrome.runtime.getManifest().version
      }.`,
      "info"
    );
  }
  // Khởi tạo processingState nếu chưa có
  chrome.storage.local.get("processingState", (result) => {
    if (!result.processingState) {
      updateProcessingState({
        isProcessing: false,
        currentProcess: "Chưa hoạt động",
        progress: 0,
        detailedStatus: "-",
        logs: [],
      });
    }
  });
});

console.log("Background script loaded.");
addLogToState("Background service worker đã khởi động.", "info");
