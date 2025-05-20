// Script xử lý quiz trực tiếp trên trang web
console.log("Quiz Handler đã được tải");

// Biến toàn cục để lưu trữ thông tin API key
let GEMINI_API_KEY = "";

// Cấu hình thời gian chờ
const CONFIG = {
  // Thời gian chờ sau khi click nút Start (ms)
  START_BUTTON_DELAY: 2000,
  // Thời gian chờ tối đa cho trang câu hỏi load (ms)
  QUESTION_LOAD_TIMEOUT: 10000,
  // Thời gian giữa các lần kiểm tra trang câu hỏi (ms)
  QUESTION_CHECK_INTERVAL: 500,
  // Số lần thử lại tối đa khi không tìm thấy element
  MAX_RETRIES: 5,
};

// Lắng nghe thông điệp từ background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Quiz Handler nhận message:", message);

  if (message.action === "handleQuiz") {
    GEMINI_API_KEY = message.apiKey;
    console.log("Đã nhận API key và bắt đầu xử lý quiz");

    // Tìm và click nút Start/Resume
    findAndClickStartResumeButton().then((success) => {
      sendResponse({ status: success ? "success" : "error" });
    });

    return true; // Đảm bảo sendResponse có thể được gọi bất đồng bộ
  }
});

// Log với màu
function log(message, type = "info") {
  const styles = {
    info: "color: #3498db; font-weight: bold;",
    success: "color: #2ecc71; font-weight: bold;",
    warning: "color: #f39c12; font-weight: bold;",
    error: "color: #e74c3c; font-weight: bold;",
  };

  console.log(`%c[QUIZ-HANDLER] ${message}`, styles[type] || styles.info);
}

// Hàm sleep để đợi một khoảng thời gian
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Hàm thử lại một hàm nhiều lần cho đến khi thành công
async function retry(fn, maxRetries = CONFIG.MAX_RETRIES, interval = 1000) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      retries++;
      log(`Retry ${retries}/${maxRetries} failed: ${error.message}`, "warning");
      if (retries >= maxRetries) {
        throw error;
      }
      await sleep(interval);
    }
  }
}

// Tìm và click nút Start/Resume - cập nhật để xử lý nút Start có icon
async function findAndClickStartResumeButton() {
  log("Bắt đầu tìm nút Start/Resume...", "info");

  // Đợi để trang load hoàn tất
  await sleep(2000);

  log("Verifying if we're on a quiz cover page...", "info");
  if (!isQuizCoverPage()) {
    log(
      "Not on a quiz cover page, checking if already on questions page",
      "warning"
    );
    if (isActiveQuizWithQuestions()) {
      log("Already on quiz questions page", "success");
      setTimeout(() => handleQuizContent(), 1000);
      return true;
    } else {
      log("Unable to determine page type", "error");
      return false;
    }
  }

  log(
    "Confirmed we're on a quiz cover page, attempting to click Start button",
    "info"
  );

  // First try our aggressive force click approach
  const forceClickResult = await forceClickStartButton();
  if (forceClickResult) {
    log("Successfully clicked Start button with force methods", "success");
    // Đợi cho trang câu hỏi load hoàn toàn
    const questionsLoaded = await waitForQuizQuestionsToLoad();
    if (questionsLoaded) {
      log("Quiz questions loaded successfully", "success");
      setTimeout(() => handleQuizContent(), 1000);
      return true;
    }
  }

  // If force click didn't work, fall back to retry approach
  return retry(
    async () => {
      // Existing code for button finding...
      const exactButton = document.querySelector(
        'button[data-testid="CoverPageActionButton"]'
      );
      if (exactButton) {
        // Your existing code...
      }

      // Add this at the end as a final fallback
      log(
        "All standard methods failed, trying JavaScript workarounds",
        "warning"
      );

      // Try to find button through parent containers
      const coverPageRow = document.querySelector(
        '[data-testid="cover-page-row"]'
      );
      if (coverPageRow) {
        log("Found cover page row, traversing to find button", "info");
        // Walk through all possible paths to find the button
        const actionDivs = [
          ".css-1fay0sq",
          ".action",
          '[data-testid="CoverPageAction__controls"]',
          ".css-15359go",
        ];

        for (const selector of actionDivs) {
          const actionDiv = coverPageRow.querySelector(selector);
          if (actionDiv) {
            const buttons = actionDiv.querySelectorAll("button");
            for (const btn of buttons) {
              if (btn.textContent.toLowerCase().includes("start")) {
                log(
                  `Found Start button through container traversal: ${btn.textContent}`,
                  "success"
                );
                try {
                  // Try multiple click methods in sequence
                  btn.click();
                  btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

                  // Click with coordinates
                  const rect = btn.getBoundingClientRect();
                  const centerX = rect.left + rect.width / 2;
                  const centerY = rect.top + rect.height / 2;
                  btn.dispatchEvent(
                    new MouseEvent("click", {
                      bubbles: true,
                      cancelable: true,
                      view: window,
                      clientX: centerX,
                      clientY: centerY,
                    })
                  );

                  log("Multiple click methods executed", "success");

                  // Wait and check
                  await sleep(CONFIG.START_BUTTON_DELAY);
                  const questionsLoaded = await waitForQuizQuestionsToLoad();
                  if (questionsLoaded) {
                    log("Quiz questions loaded successfully", "success");
                    setTimeout(() => handleQuizContent(), 1000);
                    return true;
                  }
                } catch (error) {
                  log(`Error clicking button: ${error.message}`, "error");
                }
              }
            }
          }
        }
      }

      // If we reach here, all attempts failed
      throw new Error("Could not click Start button with any method");
    },
    3,
    2000
  );
}

// A robust function to force-click the Start button with multiple methods
async function forceClickStartButton() {
  // 1. Get the exact button
  const button = document.querySelector(
    'button[data-testid="CoverPageActionButton"]'
  );

  if (!button) {
    log("CoverPageActionButton not found, cannot proceed", "error");
    return false;
  }

  log(
    `Found Start button with text: "${button.textContent.trim()}"`,
    "success"
  );

  // Array of methods to try
  const clickMethods = [
    // 1. Standard click
    () => {
      log("Trying standard click()", "info");
      button.click();
    },

    // 2. Click with MouseEvent
    () => {
      log("Trying MouseEvent click", "info");
      button.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    },

    // 3. Click on button label
    () => {
      const label = button.querySelector(".cds-button-label");
      if (label) {
        log("Clicking on button label", "info");
        label.click();
        label.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    },

    // 4. Mouse events sequence
    () => {
      log("Trying mouse events sequence", "info");
      ["mousedown", "mouseup", "click"].forEach((eventType) => {
        button.dispatchEvent(
          new MouseEvent(eventType, {
            bubbles: true,
            cancelable: true,
            view: window,
          })
        );
      });
    },

    // 5. Coordinate-based click
    () => {
      log("Trying coordinate-based click", "info");
      const rect = button.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      ["mousedown", "mouseup", "click"].forEach((eventType) => {
        button.dispatchEvent(
          new MouseEvent(eventType, {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: centerX,
            clientY: centerY,
          })
        );
      });
    },

    // 6. Programmatic click with specific event properties
    () => {
      log("Trying programmatic click with specific properties", "info");
      const evt = document.createEvent("MouseEvents");
      evt.initMouseEvent(
        "click",
        true, // bubble
        true, // cancelable
        window,
        0,
        0,
        0,
        0,
        0, // coordinates
        false,
        false,
        false,
        false, // modifier keys
        0, // button
        null
      );
      button.dispatchEvent(evt);
    },

    // 7. Use JavaScript to modify element attributes and trigger click
    () => {
      log("Trying JavaScript attribute modification", "info");
      // Remove disabled state if present
      button.disabled = false;
      button.removeAttribute("aria-disabled");
      button.removeAttribute("disabled");
      // Set important styles
      button.style.cssText =
        "pointer-events: auto !important; opacity: 1 !important; cursor: pointer !important;";
      // Force click
      setTimeout(() => button.click(), 50);
    },

    // 8. Try clicking the SVG icon
    () => {
      const icon = button.querySelector('svg[data-testid="stopwatch-icon"]');
      if (icon) {
        log("Clicking on SVG icon", "info");
        icon.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    },

    // 9. JavaScript execution simulation
    () => {
      log("Simulating button click with JavaScript", "info");
      // Find potential click handlers
      const buttonCopy = button.cloneNode(true);
      document.body.appendChild(buttonCopy);
      buttonCopy.click();
      document.body.removeChild(buttonCopy);

      // Now click the original
      button.click();
    },
  ];

  // Try each method with a delay between attempts
  for (let i = 0; i < clickMethods.length; i++) {
    try {
      log(
        `Attempt ${i + 1}/${clickMethods.length} to click Start button`,
        "info"
      );
      clickMethods[i]();

      // Wait to see if navigation happens
      await sleep(1000);

      // Check if we're still on the cover page
      if (!isQuizCoverPage()) {
        log(
          `Method ${i + 1} successfully navigated away from cover page!`,
          "success"
        );
        return true;
      }
    } catch (error) {
      log(`Error with click method ${i + 1}: ${error.message}`, "error");
    }
  }

  // If all methods failed, try to directly work with the DOM structure from your HTML
  try {
    log(
      "Trying to directly access action container from HTML structure",
      "info"
    );
    const actionContainer = document.querySelector(".css-1fay0sq .action");
    if (actionContainer) {
      const buttonInContainer = actionContainer.querySelector("button");
      if (buttonInContainer) {
        log("Found button in specific action container", "success");
        buttonInContainer.click();

        await sleep(1000);
        if (!isQuizCoverPage()) {
          log("Successfully navigated away using container button!", "success");
          return true;
        }
      }
    }
  } catch (error) {
    log(`Error with direct container access: ${error.message}`, "error");
  }

  // If we get here, all methods failed
  log("All click methods failed to navigate away from cover page", "error");
  return false;
}

// Hàm đợi cho trang câu hỏi quiz load hoàn toàn từ improved_autoquiz.js
async function waitForQuizQuestionsToLoad() {
  log("Waiting for quiz questions to load...", "info");

  const startTime = Date.now();

  // Đợi cho đến khi tìm thấy các câu hỏi hoặc hết thời gian chờ
  while (Date.now() - startTime < CONFIG.QUESTION_LOAD_TIMEOUT) {
    // Kiểm tra xem có câu hỏi nào đã load chưa
    const quizElements = document.querySelectorAll(
      '[data-testid="part-Submission_MultipleChoiceQuestion"], ' +
        '[data-testid="part-Submission_CheckboxQuestion"], ' +
        '[data-testid="part-Submission_RegexQuestion"], ' +
        '[data-testid="part-Submission_NumericQuestion"]'
    );

    if (quizElements.length > 0) {
      log(`Found ${quizElements.length} quiz questions loaded`, "success");
      return true;
    }

    // Kiểm tra xem có phải vẫn ở trang cover không (nếu vẫn ở trang cover, cần click lại nút Start)
    if (isQuizCoverPage()) {
      log(
        "Still on quiz cover page, need to click Start button again",
        "warning"
      );
      return false;
    }

    // Đợi một khoảng thời gian ngắn trước khi kiểm tra lại
    await sleep(CONFIG.QUESTION_CHECK_INTERVAL);
  }

  log(
    `Timed out waiting for quiz questions to load after ${CONFIG.QUESTION_LOAD_TIMEOUT}ms`,
    "error"
  );
  return false;
}

// Xử lý nội dung quiz sau khi đã click vào nút Start/Resume
function handleQuizContent() {
  log("Đang xử lý nội dung quiz...", "info");

  // Đợi 2 giây để đảm bảo quiz đã load
  setTimeout(async () => {
    // Kiểm tra xem có phải trang quiz không
    if (isQuizPage()) {
      log("Đã phát hiện trang quiz, bắt đầu xử lý...", "success");

      // Bắt đầu xử lý các câu hỏi
      await processQuizQuestions();

      // Tìm và click nút Submit sau khi trả lời hết các câu hỏi
      submitQuiz();
    } else {
      log("Không phải trang quiz, có thể đã chuyển sang trang khác", "warning");

      // Thông báo cho background script
      chrome.runtime.sendMessage({
        action: "quizHandlerStatus",
        status: "error",
        message: "Không tìm thấy trang quiz",
      });
    }
  }, 2000);
}

// Xử lý các câu hỏi trong quiz
async function processQuizQuestions() {
  log("Đang xử lý các câu hỏi quiz...", "info");

  // Tìm tất cả các câu hỏi
  const questionContainers = findQuestionContainers();

  if (questionContainers.length === 0) {
    log("Không tìm thấy câu hỏi nào!", "error");
    return;
  }

  log(`Đã tìm thấy ${questionContainers.length} câu hỏi`, "success");

  // Xử lý từng câu hỏi
  for (let i = 0; i < questionContainers.length; i++) {
    log(`Đang xử lý câu hỏi ${i + 1}/${questionContainers.length}`, "info");
    const questionContainer = questionContainers[i];

    // Xác định loại câu hỏi và xử lý tương ứng
    const questionType = detectQuestionType(questionContainer);
    log(`Loại câu hỏi: ${questionType}`, "info");

    try {
      switch (questionType) {
        case "multipleChoice":
          await handleMultipleChoiceQuestion(questionContainer);
          break;
        case "checkbox":
          await handleCheckboxQuestion(questionContainer);
          break;
        case "textInput":
          await handleTextInputQuestion(questionContainer);
          break;
        case "dropdown":
          await handleDropdownQuestion(questionContainer);
          break;
        default:
          log(`Không hỗ trợ loại câu hỏi ${questionType}`, "warning");
      }
    } catch (error) {
      log(`Lỗi khi xử lý câu hỏi: ${error.message}`, "error");
    }

    // Đợi một chút trước khi xử lý câu hỏi tiếp theo
    await sleep(1000);
  }

  log("Đã hoàn thành việc xử lý tất cả câu hỏi", "success");
}

// Tìm các container chứa câu hỏi
function findQuestionContainers() {
  // Sử dụng selectors từ improved_autoquiz.js
  const selectors = [
    '[data-testid="part-Submission_MultipleChoiceQuestion"]',
    '[data-testid="part-Submission_CheckboxQuestion"]',
    '[data-testid="part-Submission_RegexQuestion"]',
    '[data-testid="part-Submission_NumericQuestion"]',
    ".rc-FormPartsQuestion",
    ".rc-QuestionViewer",
    ".coursera-assessment-item",
    ".quiz-question",
    '[data-test="question-container"]',
    ".c-quiz-question",
  ];

  // Thử từng selector
  for (const selector of selectors) {
    const containers = document.querySelectorAll(selector);
    if (containers.length > 0) {
      return Array.from(containers);
    }
  }

  // Nếu không tìm thấy bằng các selector cụ thể, thử tìm bằng cách khác
  // Tìm các phần tử có thể chứa câu hỏi dựa trên nội dung
  const allDivs = document.querySelectorAll("div");
  const potentialQuestions = Array.from(allDivs).filter((div) => {
    // Tìm các div có số thứ tự hoặc chứa nội dung câu hỏi
    const hasNumber = /\d+\s*[\.\)]/.test(div.textContent);
    const containsQuestion = div.textContent.includes("?");
    const hasChildrenInputs =
      div.querySelectorAll("input, select, textarea").length > 0;

    return (hasNumber || containsQuestion) && hasChildrenInputs;
  });

  return potentialQuestions;
}

// Phát hiện loại câu hỏi
function detectQuestionType(questionContainer) {
  // Kiểm tra câu hỏi trắc nghiệm một đáp án
  if (questionContainer.querySelectorAll('input[type="radio"]').length > 0) {
    return "multipleChoice";
  }

  // Kiểm tra câu hỏi nhiều đáp án
  if (questionContainer.querySelectorAll('input[type="checkbox"]').length > 0) {
    return "checkbox";
  }

  // Kiểm tra câu hỏi nhập text
  if (
    questionContainer.querySelectorAll('input[type="text"], textarea').length >
    0
  ) {
    return "textInput";
  }

  // Kiểm tra câu hỏi dropdown
  if (questionContainer.querySelectorAll("select").length > 0) {
    return "dropdown";
  }

  return "unknown";
}

// Xử lý câu hỏi trắc nghiệm một đáp án
async function handleMultipleChoiceQuestion(questionContainer) {
  // Trích xuất nội dung câu hỏi
  const questionText = extractQuestionText(questionContainer);
  log(`Câu hỏi: ${questionText}`, "info");

  // Tìm tất cả các lựa chọn
  const options = Array.from(
    questionContainer.querySelectorAll('input[type="radio"]')
  );

  if (options.length === 0) {
    log("Không tìm thấy lựa chọn nào", "error");
    return;
  }

  // Trích xuất text của các lựa chọn
  const optionTexts = options.map((option) => {
    const label =
      option.closest("label") ||
      document.querySelector(`label[for="${option.id}"]`) ||
      option.parentElement;

    return label ? label.textContent.trim() : "";
  });

  log(`Các lựa chọn: ${optionTexts.join(" | ")}`, "info");

  // Chọn đáp án ngẫu nhiên (sau này có thể kết nối Gemini API để có đáp án chính xác hơn)
  const randomIndex = Math.floor(Math.random() * options.length);
  log(`Chọn đáp án: ${optionTexts[randomIndex]}`, "success");

  // Click vào đáp án
  options[randomIndex].click();
}

// Xử lý câu hỏi nhiều đáp án
async function handleCheckboxQuestion(questionContainer) {
  // Trích xuất nội dung câu hỏi
  const questionText = extractQuestionText(questionContainer);
  log(`Câu hỏi: ${questionText}`, "info");

  // Tìm tất cả các lựa chọn
  const options = Array.from(
    questionContainer.querySelectorAll('input[type="checkbox"]')
  );

  if (options.length === 0) {
    log("Không tìm thấy lựa chọn nào", "error");
    return;
  }

  // Trích xuất text của các lựa chọn
  const optionTexts = options.map((option) => {
    const label =
      option.closest("label") ||
      document.querySelector(`label[for="${option.id}"]`) ||
      option.parentElement;

    return label ? label.textContent.trim() : "";
  });

  log(`Các lựa chọn: ${optionTexts.join(" | ")}`, "info");

  // Chọn ngẫu nhiên 1-3 đáp án
  const numToSelect =
    Math.floor(Math.random() * Math.min(3, options.length)) + 1;
  const selectedIndices = [];

  while (selectedIndices.length < numToSelect) {
    const randomIndex = Math.floor(Math.random() * options.length);
    if (!selectedIndices.includes(randomIndex)) {
      selectedIndices.push(randomIndex);
      log(`Chọn đáp án: ${optionTexts[randomIndex]}`, "success");
      options[randomIndex].click();
    }
  }
}

// Xử lý câu hỏi nhập text
async function handleTextInputQuestion(questionContainer) {
  // Trích xuất nội dung câu hỏi
  const questionText = extractQuestionText(questionContainer);
  log(`Câu hỏi: ${questionText}`, "info");

  // Tìm ô nhập text
  const textInputs = questionContainer.querySelectorAll(
    'input[type="text"], textarea'
  );

  if (textInputs.length === 0) {
    log("Không tìm thấy ô nhập text", "error");
    return;
  }

  // Nhập câu trả lời đơn giản
  Array.from(textInputs).forEach((input) => {
    const answer = "This is a sample answer provided by the auto-quiz system.";
    log(`Nhập câu trả lời: ${answer}`, "success");

    // Sử dụng setter của native input để cập nhật giá trị (từ improved_autoquiz.js)
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    ).set;
    nativeInputValueSetter.call(input, answer);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

// Xử lý câu hỏi dropdown
async function handleDropdownQuestion(questionContainer) {
  // Trích xuất nội dung câu hỏi
  const questionText = extractQuestionText(questionContainer);
  log(`Câu hỏi: ${questionText}`, "info");

  // Tìm tất cả các dropdown
  const selects = questionContainer.querySelectorAll("select");

  if (selects.length === 0) {
    log("Không tìm thấy dropdown nào", "error");
    return;
  }

  // Xử lý từng dropdown
  Array.from(selects).forEach((select) => {
    const options = Array.from(select.options).filter((option) => option.value);

    if (options.length > 0) {
      // Chọn một option ngẫu nhiên (bỏ qua option đầu tiên vì thường là placeholder)
      const randomIndex = Math.floor(Math.random() * options.length);
      const selectedOption = options[randomIndex];

      log(`Chọn đáp án: ${selectedOption.textContent}`, "success");

      // Chọn option
      select.value = selectedOption.value;

      // Kích hoạt sự kiện change
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
}

// Trích xuất nội dung câu hỏi
function extractQuestionText(questionContainer) {
  // Thêm selectors từ improved_autoquiz.js
  const selectors = [
    'div[id^="prompt-autoGradableResponseId"]',
    '[id^="prompt-autoGradableElementId"]',
    ".question-text",
    ".question-prompt",
    ".rc-QuestionBody",
    ".c-question-text",
    "[data-test='question-prompt']",
  ];

  // Thử từng selector
  for (const selector of selectors) {
    const element = questionContainer.querySelector(selector);
    if (element && element.textContent.trim()) {
      return element.textContent.trim();
    }
  }

  // Nếu không tìm được bằng selector, lấy text của container
  // và loại bỏ text của các input, label
  const fullText = questionContainer.textContent.trim();
  const inputLabels = Array.from(
    questionContainer.querySelectorAll("label, input, button")
  )
    .map((el) => el.textContent.trim())
    .filter((text) => text)
    .join("|");

  // Loại bỏ các label ra khỏi text
  const cleanedText = fullText.split("\n")[0]; // Thường câu hỏi nằm ở dòng đầu tiên

  return cleanedText || fullText.substring(0, 100) + "..."; // Trả về một phần nếu quá dài
}

// Hàm cải tiến để tìm và click nút submit (từ improved_autoquiz.js)
function forceClickSubmitButton() {
  // Debug all submit button candidates
  log("Looking for submit buttons...", "info");
  const allButtons = document.querySelectorAll("button");

  for (const button of allButtons) {
    if (
      button.textContent.includes("Submit") ||
      button.getAttribute("aria-label") === "Submit" ||
      button.getAttribute("data-testid") === "submit-button"
    ) {
      const isDisabled =
        button.disabled ||
        button.getAttribute("aria-disabled") === "true" ||
        button.classList.contains("cds-button-disabled");

      log("Found button:", {
        text: button.textContent.trim(),
        "data-testid": button.getAttribute("data-testid"),
        "aria-label": button.getAttribute("aria-label"),
        classes: button.className,
        disabled: isDisabled,
      });

      if (!isDisabled) {
        log("Attempting to click valid submit button...", "success");

        try {
          // Try standard click first
          button.click();
          log("Standard click executed", "success");

          // Force-click as a backup
          const clickEvent = document.createEvent("MouseEvents");
          clickEvent.initEvent("click", true, true);
          button.dispatchEvent(clickEvent);
          log("Forced click event dispatched", "success");

          // Attempt to focus and then click
          button.focus();
          setTimeout(() => button.click(), 100);
          log("Focus + delayed click executed", "success");

          return true;
        } catch (error) {
          log(`Error clicking button: ${error.message}`, "error");
        }
      }
    }
  }

  // Specifically target the button in the container shown in the example
  const specificButtonSelectors = [
    '.css-hb4vw3 > button[data-testid="submit-button"]',
    'button.cds-button-primary[data-testid="submit-button"]',
    '.css-hb4vw3 button[aria-label="Submit"]',
  ];

  for (const selector of specificButtonSelectors) {
    const specificButton = document.querySelector(selector);
    if (specificButton) {
      log(
        `Found specific submit button using selector: ${selector}`,
        "success"
      );

      try {
        specificButton.click();
        log("Clicked specific submit button", "success");
        setTimeout(() => {
          log("Delay 2s done", "info");
        }, 2000);
        return true;
      } catch (error) {
        log(
          `Error clicking specific button with selector ${selector}: ${error.message}`,
          "error"
        );
      }
    }
  }

  log("Could not find or click any submit button", "warning");
  return false;
}

// Hàm xử lý dialog "Ready to submit?" từ improved_autoquiz.js
function handleReadyToSubmitDialog() {
  // Tìm nút submit trong dialog
  const dialogSubmitButton = document.querySelector(
    'button[data-testid="dialog-submit-button"]'
  );
  if (dialogSubmitButton) {
    log("Found 'Ready to submit' dialog, clicking Submit button...", "success");
    try {
      dialogSubmitButton.click();
      log("Clicked 'Submit' button in the dialog", "success");
      return true;
    } catch (error) {
      log(`Error clicking dialog submit button: ${error.message}`, "error");
    }
  }

  // Backup: tìm nút submit trong dialog dựa vào container và class
  const dialogSubmitButtonBackup = document.querySelector(
    ".css-6z6oep button.cds-button-primary"
  );
  if (dialogSubmitButtonBackup) {
    log("Found dialog submit button using backup selector", "success");
    try {
      dialogSubmitButtonBackup.click();
      log("Clicked dialog submit button (backup)", "success");
      return true;
    } catch (error) {
      log(
        `Error clicking dialog submit button (backup): ${error.message}`,
        "error"
      );
    }
  }

  return false;
}

// Tìm và click nút Submit - cập nhật từ improved_autoquiz.js
function submitQuiz() {
  log("Đang tìm nút Submit...", "info");

  // Kiểm tra xem có dialog "Ready to submit?" không
  const readyToSubmitDialog = document.querySelector(
    '[data-e2e="SubmitDialog__heading"]'
  );
  if (readyToSubmitDialog) {
    log("Found 'Ready to submit?' dialog", "info");
    handleReadyToSubmitDialog();
    return;
  }

  // Đợi 2 giây trước khi tìm nút submit để đảm bảo tất cả câu trả lời đã được xử lý
  setTimeout(() => {
    // Tick vào ô đồng ý (Agreement checkbox) nếu có
    const agreementCheckbox = document.querySelector(
      'div[data-testid="agreement-standalone-checkbox"] input[type="checkbox"]'
    );
    if (agreementCheckbox && !agreementCheckbox.checked) {
      agreementCheckbox.click();
      log("Agreement checkbox ticked.", "success");
    }

    // Sử dụng hàm cải tiến để click nút submit
    const submitClicked = forceClickSubmitButton();

    if (!submitClicked) {
      log(
        "Could not click submit button. Will retry in 1 second...",
        "warning"
      );
      // Retry after a short delay
      setTimeout(() => {
        forceClickSubmitButton();
      }, 1000);
    }

    // Sau 2 giây, check và handle dialog "Ready to submit?"
    setTimeout(() => {
      // Kiểm tra xem dialog "Ready to submit?" đã xuất hiện chưa
      if (document.querySelector('[data-e2e="SubmitDialog__heading"]')) {
        log("Found 'Ready to submit?' dialog after delay", "info");
        handleReadyToSubmitDialog();

        // Thông báo cho background script
        setTimeout(() => {
          chrome.runtime.sendMessage({
            action: "quizHandlerStatus",
            status: "completed",
            message: "Quiz đã được hoàn thành và submit",
          });
        }, 2000);
      } else {
        // Tìm kiếm dialog submit button thông thường
        const dialogSubmitButton = document.querySelector(
          'button[data-testid="dialog-submit-button"]'
        );
        if (dialogSubmitButton) {
          dialogSubmitButton.click();
          log("Dialog Submit button clicked.", "success");

          // Thông báo cho background script
          setTimeout(() => {
            chrome.runtime.sendMessage({
              action: "quizHandlerStatus",
              status: "completed",
              message: "Quiz đã được hoàn thành và submit",
            });
          }, 2000);
        } else {
          log(
            "Dialog Submit button không tìm thấy, sẽ tìm các nút tương tự...",
            "warning"
          );

          // Tìm các nút có text hoặc label liên quan đến submit/confirm
          const confirmButtons = Array.from(
            document.querySelectorAll("button")
          ).filter((btn) => {
            const text = btn.textContent.trim().toLowerCase();
            const label = (btn.getAttribute("aria-label") || "").toLowerCase();
            return (
              text.includes("confirm") ||
              text.includes("submit") ||
              label.includes("confirm") ||
              label.includes("submit")
            );
          });

          if (confirmButtons.length > 0) {
            log("Found potential confirm button, clicking...", "success");
            confirmButtons[0].click();

            // Thông báo cho background script
            setTimeout(() => {
              chrome.runtime.sendMessage({
                action: "quizHandlerStatus",
                status: "completed",
                message: "Quiz đã được hoàn thành và submit",
              });
            }, 2000);
          } else {
            log("Không tìm thấy nút Submit hoặc Confirm nào!", "error");

            // Thông báo cho background script
            chrome.runtime.sendMessage({
              action: "quizHandlerStatus",
              status: "warning",
              message: "Đã trả lời các câu hỏi nhưng không tìm thấy nút Submit",
            });
          }
        }
      }
    }, 2000);
  }, 2000);
}

// Kiểm tra xem có phải trang quiz không (cập nhật từ improved_autoquiz.js)
function isQuizPage() {
  // Kiểm tra URL
  if (
    window.location.href.includes("/quiz/") ||
    window.location.href.includes("/assignment-submission/") ||
    window.location.href.includes("/team/")
  ) {
    return true;
  }

  // Kiểm tra các element đặc trưng của trang quiz
  return isActiveQuizWithQuestions() || isQuizCoverPage();
}

// Phát hiện xem đang ở trang cover của quiz (có nút Start/Resume)
function isQuizCoverPage() {
  // Direct test for the exact button from your HTML
  const startButtonWithIcon = document.querySelector(
    'button[data-testid="CoverPageActionButton"] .cds-button-startIcon svg[data-testid="stopwatch-icon"]'
  );
  if (startButtonWithIcon) return true;

  // Check for the exact button
  const actionButton = document.querySelector(
    'button[data-testid="CoverPageActionButton"]'
  );
  if (actionButton && actionButton.textContent.toLowerCase().includes("start"))
    return true;

  // Check for the cover page container with assignment details
  const coverPageRow = document.querySelector('[data-testid="cover-page-row"]');
  if (coverPageRow) {
    const assignmentDetailsHeading = coverPageRow.querySelector("h2");
    if (
      assignmentDetailsHeading &&
      assignmentDetailsHeading.textContent.includes("Assignment details")
    ) {
      return true;
    }
  }

  // Check for the specific container structure with action button
  const actionContainer = document.querySelector(".css-1fay0sq .action");
  if (actionContainer && actionContainer.querySelector("button")) return true;

  // Check for primary buttons with Start text
  const startButtons = Array.from(document.querySelectorAll("button")).filter(
    (btn) => {
      const text = (btn.textContent || "").trim().toLowerCase();
      return text.includes("start") || text.includes("resume");
    }
  );

  return startButtons.length > 0;
}

// Phát hiện xem đang ở trang quiz đang làm với các câu hỏi
function isActiveQuizWithQuestions() {
  const quizElements = document.querySelectorAll(
    '[data-testid="part-Submission_MultipleChoiceQuestion"], ' +
      '[data-testid="part-Submission_CheckboxQuestion"], ' +
      '[data-testid="part-Submission_RegexQuestion"], ' +
      '[data-testid="part-Submission_NumericQuestion"]'
  );
  return quizElements.length > 0;
}
