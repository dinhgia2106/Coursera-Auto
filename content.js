// Biến toàn cục để lưu dữ liệu quiz từ popup
let quizData = [];

// Hàm lấy userId từ localStorage
function getUserId() {
  const allKeys = Object.keys(localStorage);
  const key = allKeys.find((key) => key.includes("userPreferences"));
  if (!key) {
    console.error("Không tìm thấy userId trong localStorage");
    return "";
  }
  return key.split(".")[0];
}

// Hàm lấy danh sách item từ khóa học
async function getMaterialCourse(slug) {
  const response = await fetch(
    `https://www.coursera.org/api/onDemandCourseMaterials.v2/?q=slug&slug=${slug}&includes=modules%2Clessons%2CpassableItemGroups%2CpassableItemGroupChoices%2CpassableLessonElements%2Citems%2Ctracks%2CgradePolicy%2CgradingParameters%2CembeddedContentMapping&fields=moduleIds%2ConDemandCourseMaterialModules.v1(name%2Cslug%2Cdescription%2CtimeCommitment%2ClessonIds%2Coptional%2clearningObjectives)%2ConDemandCourseMaterialLessons.v1(name%2Cslug%2CtimeCommitment%2CelementIds%2Coptional%2CtrackId)%2ConDemandCourseMaterialPassableItemGroups.v1(requiredPassedCount%2CpassableItemGroupChoiceIds%2CtrackId)%2ConDemandCourseMaterialPassableItemGroupChoices.v1(name%2Cdescription%2CitemIds)%2ConDemandCourseMaterialPassableLessonElements.v1(gradingWeight%2CisRequiredForPassing)%2ConDemandCourseMaterialItems.v2(name%2CoriginalName%2Cslug%2CtimeCommitment%2CcontentSummary%2CisLocked%2ClockableByItem%2CitemLockedReasonCode%2CtrackId%2ClockedStatus%2CitemLockSummary)%2ConDemandCourseMaterialTracks.v1(passablesCount)%2ConDemandGradingParameters.v1(gradedAssignmentGroups)%2CcontentAtomRelations.v1(embeddedContentSourceCourseId%2CsubContainerId)&showLockedItems=true`,
    {
      headers: {
        accept: "*/*",
        "accept-language": "en",
        "cache-control": "no-cache",
        pragma: "no-cache",
        priority: "u=1, i",
        "sec-ch-ua":
          '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
      },
      method: "GET",
      credentials: "include",
    }
  );

  const data = await response.json();
  let allItems = [];
  if (response.ok) {
    const lessons = data.linked["onDemandCourseMaterialLessons.v1"];
    const items = data.linked["onDemandCourseMaterialItems.v2"];
    lessons.forEach((lesson) => {
      lesson.itemIds.forEach((itemId) => {
        const item = items.find((i) => i.id === itemId);
        if (item) {
          allItems.push({
            id: itemId,
            type: item.contentSummary ? item.contentSummary.type : "unknown",
          });
        }
      });
    });
    return { items: allItems, course_id: data.elements[0].id };
  }
  console.error("Lỗi khi lấy dữ liệu khóa học:", response.status);
  return null;
}

// Hàm đánh dấu video hoàn thành
async function applyEndedVideo(itemId, slug) {
  const response = await fetch(
    `https://www.coursera.org/api/opencourse.v1/user/${getUserId()}/course/${slug}/item/${itemId}/lecture/videoEvents/ended?autoEnroll=false`,
    {
      headers: {
        accept: "*/*",
        "accept-language": "en",
        "cache-control": "no-cache",
        "content-type": "application/json; charset=UTF-8",
        pragma: "no-cache",
        priority: "u=1, i",
        "sec-ch-ua":
          '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
      },
      body: '{"contentRequestBody":{}}',
      method: "POST",
      credentials: "include",
    }
  );
  console.log(`applyEndedVideo cho ${itemId}: ${response.status}`);
  return response.ok;
}

// Hàm đánh dấu tài liệu bổ sung hoàn thành
async function completeReading(itemId, course_id) {
  const payload = {
    userId: parseInt(getUserId()),
    itemId: itemId,
    courseId: course_id,
  };
  const response = await fetch(
    "https://www.coursera.org/api/onDemandSupplementCompletions.v1",
    {
      headers: {
        accept: "*/*",
        "accept-language": "en",
        "cache-control": "no-cache",
        "content-type": "application/json; charset=UTF-8",
        pragma: "no-cache",
        priority: "u=1, i",
        "sec-ch-ua":
          '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
      },
      body: JSON.stringify(payload),
      method: "POST",
      credentials: "include",
    }
  );
  console.log(`completeReading cho ${itemId}: ${response.status}`);
  return response.ok;
}

// Hàm gửi trạng thái tổng quan đến popup và badge
function updateStatus(message) {
  console.log("Sending UPDATE_STATUS:", message);
  chrome.runtime.sendMessage({ type: "UPDATE_STATUS", status: message });
}

// Hàm gửi chi tiết từng bước thực thi đến popup
function updateProgress(message) {
  console.log("Sending UPDATE_PROGRESS:", message);
  chrome.runtime.sendMessage({ type: "UPDATE_PROGRESS", progress: message });
}

// Hàm yêu cầu reload trang
function reloadPage() {
  chrome.runtime.sendMessage({ type: "RELOAD_PAGE" });
}

// Hàm chờ một khoảng thời gian
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Hàm xử lý từng câu hỏi trong quiz
function answerQuiz() {
  (function () {
    // Hàm chuẩn hóa văn bản
    function normalizeText(text) {
      return text.replace(/\s+/g, " ").trim().toLowerCase();
    }

    // Hàm tính khoảng cách Levenshtein
    function levenshtein(a, b) {
      const m = a.length,
        n = b.length;
      if (m === 0) return n;
      if (n === 0) return m;
      const matrix = [];
      for (let i = 0; i <= n; i++) matrix[i] = [i];
      for (let j = 0; j <= m; j++) matrix[0][j] = j;
      for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
          if (b.charAt(i - 1) === a.charAt(j - 1)) {
            matrix[i][j] = matrix[i - 1][j - 1];
          } else {
            matrix[i][j] = Math.min(
              matrix[i - 1][j - 1] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j] + 1
            );
          }
        }
      }
      return matrix[n][m];
    }

    // Tách câu hỏi khỏi đáp án nếu có định dạng A, B, C
    function getQuestionOnly(text_input) {
      if (/\n\s*[A-Z]\.\s+/.test(text_input)) {
        const parts = text_input.split(/\n\s*[A-Z]\.\s+/);
        return parts[0].trim();
      }
      return text_input.trim();
    }

    // Parse đáp án trắc nghiệm
    function parseAnswerOptions(text_input) {
      const lines = text_input.split("\n");
      const mapping = {};
      const regex = /^([A-Z])\.\s*(.+)$/;
      lines.forEach((line) => {
        const match = line.match(regex);
        if (match) mapping[match[1]] = match[2].trim();
      });
      return mapping;
    }

    // Tìm câu hỏi khớp nhất
    function findBestMatch(questionText) {
      let bestMatchIndex = -1;
      let bestMatch = null;
      let bestDistance = Infinity;
      const normalizedQuestion = normalizeText(questionText);

      for (let i = 0; i < quizData.length; i++) {
        const item = quizData[i];
        const quizQuestion = normalizeText(getQuestionOnly(item.text_input));
        let distance = levenshtein(normalizedQuestion, quizQuestion);
        if (
          normalizedQuestion.includes(quizQuestion) ||
          quizQuestion.includes(normalizedQuestion)
        )
          distance = 0;

        if (distance < bestDistance) {
          bestDistance = distance;
          bestMatch = item;
          bestMatchIndex = i;
        }
      }

      if (bestMatchIndex !== -1) quizData.splice(bestMatchIndex, 1);
      return bestMatch;
    }

    // Lấy văn bản của option trắc nghiệm
    function getOptionText(optionElement) {
      const textContainer = optionElement.querySelector(".rc-CML");
      return textContainer ? textContainer.innerText.trim() : "";
    }

    // Xử lý trắc nghiệm (MCQ)
    const mcqPrompts = document.querySelectorAll(
      'div[id^="prompt-autoGradableResponseId"]'
    );
    mcqPrompts.forEach((prompt) => {
      if (
        prompt.closest('[data-testid="part-Submission_RegexQuestion"]') ||
        prompt.closest('[data-testid="part-Submission_NumericQuestion"]')
      )
        return;
      const questionText = prompt.innerText.trim();
      console.log("Processing MCQ question:", questionText);

      const match = findBestMatch(questionText);
      if (match) {
        console.log("Best match found (MCQ):", match);
        const answerMapping = parseAnswerOptions(match.text_input);
        const questionContainer = prompt.closest(".css-dqaucz");
        const optionsContainer = questionContainer?.querySelector(
          '[role="radiogroup"], [role="group"]'
        );
        const optionElements = optionsContainer?.querySelectorAll(".rc-Option");

        if (Object.keys(answerMapping).length > 0) {
          let answerLetters =
            match.output.match(/^([A-Z])\.\s*(.+)$/)?.[1] ||
            match.output.split(" ");
          answerLetters.forEach((letter) => {
            const expectedText = answerMapping[letter];
            let bestOption = null;
            let bestOptionDistance = Infinity;
            optionElements?.forEach((option) => {
              const optionText = getOptionText(option);
              const distance = levenshtein(
                normalizeText(optionText),
                normalizeText(expectedText)
              );
              if (distance < bestOptionDistance) {
                bestOptionDistance = distance;
                bestOption = option;
              }
            });
            if (bestOption) {
              const input = bestOption.querySelector("input");
              if (input && !input.checked) input.click();
            }
          });
        } else {
          const expectedAnswer = match.output.trim();
          let bestOption = null;
          let bestOptionDistance = Infinity;
          optionElements?.forEach((option) => {
            const optionText = getOptionText(option);
            const distance = levenshtein(
              normalizeText(optionText),
              normalizeText(expectedAnswer)
            );
            if (distance < bestOptionDistance) {
              bestOptionDistance = distance;
              bestOption = option;
            }
          });
          if (bestOption) {
            const input = bestOption.querySelector("input");
            if (input && !input.checked) input.click();
          }
        }
      }
    });

    // Xử lý điền đáp án
    function processInputQuestion(selector) {
      const containers = document.querySelectorAll(selector);
      containers.forEach((container) => {
        const prompt = container.querySelector(
          '[id^="prompt-autoGradableResponseId"]'
        );
        const questionText = prompt?.innerText.trim();
        const match = findBestMatch(questionText);
        if (match) {
          const inputElement = container.querySelector(
            'input[type="text"], input[type="number"]'
          );
          if (inputElement) {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              "value"
            ).set;
            nativeInputValueSetter.call(inputElement, match.output);
            inputElement.dispatchEvent(new Event("input", { bubbles: true }));
            inputElement.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      });
    }

    processInputQuestion('div[data-testid="part-Submission_RegexQuestion"]');
    processInputQuestion('div[data-testid="part-Submission_NumericQuestion"]');

    // Tick ô đồng ý
    const agreementCheckbox = document.querySelector(
      'div[data-testid="agreement-standalone-checkbox"] input[type="checkbox"]'
    );
    if (agreementCheckbox && !agreementCheckbox.checked)
      agreementCheckbox.click();

    // Submit lần đầu
    const submitButton = document.querySelector(
      'button[data-testid="submit-button"]'
    );
    if (submitButton) submitButton.click();

    // Submit trong dialog sau 1 giây
    setTimeout(() => {
      const dialogSubmitButton = document.querySelector(
        'button[data-testid="dialog-submit-button"]'
      );
      if (dialogSubmitButton) dialogSubmitButton.click();
    }, 1000);
  })();
}

// Hàm xử lý từng quiz trong module
async function processQuiz(quizLink) {
  updateProgress(`Đang xử lý quiz: ${quizLink.textContent}`);
  window.location.href = quizLink.href; // Chuyển đến trang quiz
  await sleep(2000); // Chờ trang tải

  const startButton = document.querySelector(
    'button[data-testid="CoverPageActionButton"]'
  );
  if (startButton) {
    startButton.click();
    await sleep(2000); // Chờ trang quiz tải
    updateProgress("Đã bấm Start, đang trả lời quiz...");
    answerQuiz();
    await sleep(3000); // Chờ submit hoàn tất
  } else {
    updateProgress("Không tìm thấy nút Start trong quiz.");
  }
}

// Hàm xử lý từng module
async function processModule(moduleLink) {
  updateProgress(`Đang xử lý module: ${moduleLink.textContent}`);
  window.location.href = moduleLink.href;
  await sleep(2000); // Chờ trang module tải

  const assignments = document.querySelectorAll(
    ".cds-196.css-cgu8ti.cds-198.cds-grid-item"
  );
  const quizLinks = Array.from(assignments)
    .filter(
      (el) =>
        el.textContent.includes("Practice Assignment") ||
        el.textContent.includes("Graded Assignment")
    )
    .map((el) => el.closest("a"));

  for (const quizLink of quizLinks) {
    await processQuiz(quizLink);
    window.location.href = moduleLink.href; // Quay lại trang module
    await sleep(2000); // Chờ trang module tải lại
  }
}

// Hàm xử lý quiz sau khi reload
async function processQuizzes() {
  updateProgress("Bắt đầu xử lý quiz trong các module...");
  const moduleLinks = document.querySelectorAll(
    'a[data-test="rc-WeekNavigationItem"]'
  );
  for (const moduleLink of moduleLinks) {
    await processModule(moduleLink);
  }
  updateStatus("Hoàn thành toàn bộ khóa học!");
}

// Hàm chính xử lý khóa học
async function processCourse() {
  updateStatus("Bắt đầu xử lý khóa học...");
  const slug = window.location.pathname.split("/")[2];
  const material = await getMaterialCourse(slug);

  if (material && material.items.length > 0) {
    const totalItems = material.items.length;
    let completedItems = 0;

    for (let i = 0; i < material.items.length; i++) {
      const item = material.items[i];
      updateProgress(`Đang xử lý item ${item.id}...`);
      updateStatus(
        `Đang xử lý: ${i + 1}/${totalItems} (${Math.round(
          ((i + 1) / totalItems) * 100
        )}%)`
      );

      try {
        const promises = [
          applyEndedVideo(item.id, slug),
          completeReading(item.id, material.course_id),
        ];

        const results = await Promise.allSettled(promises);
        const success = results.some(
          (result) => result.status === "fulfilled" && result.value === true
        );

        if (success) {
          completedItems++;
          updateProgress(`Item ${item.id}: Thành công`);
        } else {
          updateProgress(`Item ${item.id}: Thất bại`);
        }
      } catch (error) {
        console.error(`Lỗi khi xử lý item ${item.id}:`, error);
        updateProgress(`Item ${item.id}: Lỗi - ${error.message}`);
      }

      await sleep(300); // Delay giữa các item
    }

    updateStatus(`Hoàn thành: ${completedItems}/${totalItems}`);
    updateProgress(`Tất cả items đã được xử lý. Đang reload trang...`);
    localStorage.setItem("courseraAutoProcessedItems", "true"); // Lưu flag
    reloadPage();
  } else {
    updateStatus("Không thể lấy dữ liệu khóa học.");
    updateProgress("Lỗi: Không thể lấy dữ liệu khóa học.");
  }
}

// Kiểm tra flag sau khi trang load
window.addEventListener("load", () => {
  if (localStorage.getItem("courseraAutoProcessedItems") === "true") {
    localStorage.removeItem("courseraAutoProcessedItems"); // Xóa flag
    processQuizzes(); // Tiếp tục xử lý quiz
  }
});

// Lắng nghe tin nhắn từ popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SET_QUIZ_DATA") {
    try {
      quizData = JSON.parse(message.data);
      console.log("Quiz data updated:", quizData);
      updateStatus("Đã cập nhật quiz data thành công!");
    } catch (error) {
      console.error("Invalid JSON data:", error);
      updateStatus("Lỗi: JSON không hợp lệ!");
    }
  } else if (message.type === "START_PROCESS") {
    processCourse();
  }
});
