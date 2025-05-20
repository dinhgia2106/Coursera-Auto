// Service Worker cho extension
chrome.runtime.onInstalled.addListener(() => {
  console.log("Coursera Auto Learn & Quiz đã được cài đặt");
});

// Lắng nghe tin nhắn từ content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background script nhận tin nhắn:", message);

  if (message.action === "autoLearn") {
    // Thực thi script Auto Learn trên tab hiện tại
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      function: autoLearnScript,
    });
    sendResponse({ status: "success" });
  } else if (message.action === "autoQuiz") {
    // Lấy API key từ storage
    chrome.storage.sync.get(["geminiApiKey"], function (result) {
      if (result.geminiApiKey) {
        // Lưu API key vào biến global trong background script
        const apiKey = result.geminiApiKey;

        // Thông báo cho content script để inject quiz_handler.js
        chrome.tabs.sendMessage(sender.tab.id, {
          action: "injectQuizHandler",
          apiKey: apiKey,
        });

        // Thực thi auto quiz script
        chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          function: autoQuizScript,
          args: [apiKey],
        });

        sendResponse({ status: "success" });
      } else {
        sendResponse({
          status: "error",
          message: "API key không được cung cấp",
        });
      }
    });

    return true; // Đảm bảo sendResponse có thể được gọi bất đồng bộ
  } else if (message.action === "quizHandlerStatus") {
    console.log("Nhận trạng thái từ Quiz Handler:", message);

    // Xử lý các trạng thái khác nhau từ quiz_handler.js
    if (message.status === "completed") {
      console.log("Quiz đã hoàn thành, tiến hành chuyển đến module tiếp theo");

      // Đợi một chút và chuyển đến module tiếp theo
      setTimeout(() => {
        chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          function: navigateToNextModule,
        });
      }, 3000);
    } else if (message.status === "error") {
      console.error("Lỗi từ Quiz Handler:", message.message);
    }
  }
});

// Mã nguồn cho Auto Learn
function autoLearnScript() {
  async function applyEndedVideo(itemId, slug) {
    try {
      const response = await fetch(
        `https://www.coursera.org/api/opencourse.v1/user/${getUserId()}/course/${slug}/item/${itemId}/lecture/videoEvents/ended?autoEnroll=false`,
        {
          headers: {
            accept: "/",
            "accept-language": "en",
            "cache-control": "no-cache",
            "content-type": "application/json; charset=UTF-8",
            pragma: "no-cache",
            priority: "u=1, i",
            "sec-ch-ua":
              '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": '"Android"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "x-requested-with": "XMLHttpRequest",
          },
          referrerPolicy: "strict-origin-when-cross-origin",
          body: '{"contentRequestBody":{}}',
          method: "POST",
          mode: "cors",
          credentials: "include",
        }
      );
      return response.ok;
    } catch (error) {
      console.error("Error in applyEndedVideo:", error);
      return false;
    }
  }

  async function completeReading(itemId, course_id) {
    try {
      const payload = {
        userId: parseInt(getUserId()),
        itemId: itemId,
        courseId: course_id,
      };
      const response = await fetch(
        "https://www.coursera.org/api/onDemandSupplementCompletions.v1",
        {
          headers: {
            accept: "/",
            "accept-language": "en",
            "cache-control": "no-cache",
            "content-type": "application/json; charset=UTF-8",
            pragma: "no-cache",
            priority: "u=1, i",
            "sec-ch-ua":
              '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": '"Android"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "x-coursera-application": "ondemand",
          },
          referrerPolicy: "strict-origin-when-cross-origin",
          body: JSON.stringify(payload),
          method: "POST",
          mode: "cors",
          credentials: "include",
        }
      );
      return response.ok;
    } catch (error) {
      console.error("Error in completeReading:", error);
      return false;
    }
  }

  function getUserId() {
    const allKeys = Object.keys(localStorage);
    const key = allKeys.find((key) => key.includes("userPreferences"));
    if (!key) return "";
    return key.split(".")[0];
  }

  async function getQuestionId(itemId, course_id) {
    try {
      const response = await fetch(
        `https://www.coursera.org/api/onDemandDiscussionPrompts.v1/${getUserId()}~${course_id}~${itemId}?fields=onDemandDiscussionPromptQuestions.v1(content,creatorId,createdAt,forumId,sessionId,lastAnsweredBy,lastAnsweredAt,totalAnswerCount,topLevelAnswerCount,viewCount),promptType,question&includes=question`,
        {
          headers: {
            accept: "/",
            "accept-language": "en-US,en;q=0.9",
            "cache-control": "no-cache",
            pragma: "no-cache",
            priority: "u=1, i",
            "sec-ch-ua":
              '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": '"Android"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
          },
          referrerPolicy: "strict-origin-when-cross-origin",
          method: "GET",
          mode: "cors",
          credentials: "include",
        }
      );

      const data = await response.json();
      return data.elements[0]?.promptType?.definition?.courseItemForumQuestionId.split(
        "~"
      )[2];
    } catch (error) {
      console.error("Error in getQuestionId:", error);
      return null;
    }
  }

  async function postAnswer(itemId, course_id) {
    try {
      const questionId = await getQuestionId(itemId, course_id);
      if (!questionId) return false;

      const payload = {
        content: {
          typeName: "cml",
          definition: {
            dtdId: "discussion/1",
            value: "<co-content><text>hi</text></co-content>",
          },
        },
        courseForumQuestionId: course_id + "~" + questionId,
      };

      const response = await fetch(
        `https://www.coursera.org/api/onDemandCourseForumAnswers.v1/?fields=content%2CforumQuestionId%2CparentForumAnswerId%2Cstate%2CcreatorId%2CcreatedAt%2Corder%2CupvoteCount%2CchildAnswerCount%2CisFlagged%2CisUpvoted%2CcourseItemForumQuestionId%2CparentCourseItemForumAnswerId%2ConDemandSocialProfiles.v1(userId%2CexternalUserId%2CfullName%2CphotoUrl%2CcourseRole)%2ConDemandCourseForumAnswers.v1(content%2CforumQuestionId%2CparentForumAnswerId%2Cstate%2CcreatorId%2CcreatedAt%2Corder%2CupvoteCount%2CchildAnswerCount%2CisFlagged%2CisUpvoted%2CcourseItemForumQuestionId%2CparentCourseItemForumAnswerId)&includes=profiles%2Cchildren%2CuserId`,
        {
          headers: {
            accept: "/",
            "accept-language": "en",
            "cache-control": "no-cache",
            "content-type": "application/json; charset=UTF-8",
            pragma: "no-cache",
            priority: "u=1, i",
            "sec-ch-ua":
              '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": '"Android"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "x-coursera-application": "ondemand",
          },
          referrerPolicy: "strict-origin-when-cross-origin",
          body: JSON.stringify(payload),
          method: "POST",
          mode: "cors",
          credentials: "include",
        }
      );
      return response.ok;
    } catch (error) {
      console.error("Error in postAnswer:", error);
      return false;
    }
  }

  async function getMaterialCourse(slug) {
    try {
      const response = await fetch(
        `https://www.coursera.org/api/onDemandCourseMaterials.v2/?q=slug&slug=${slug}&includes=modules%2Clessons%2CpassableItemGroups%2CpassableItemGroupChoices%2CpassableLessonElements%2Citems%2Ctracks%2CgradePolicy%2CgradingParameters%2CembeddedContentMapping&fields=moduleIds%2ConDemandCourseMaterialModules.v1(name%2Cslug%2Cdescription%2CtimeCommitment%2ClessonIds%2Coptional%2ClearningObjectives)%2ConDemandCourseMaterialLessons.v1(name%2Cslug%2CtimeCommitment%2CelementIds%2Coptional%2CtrackId)%2ConDemandCourseMaterialPassableItemGroups.v1(requiredPassedCount%2CpassableItemGroupChoiceIds%2CtrackId)%2ConDemandCourseMaterialPassableItemGroupChoices.v1(name%2Cdescription%2CitemIds)%2ConDemandCourseMaterialPassableLessonElements.v1(gradingWeight%2CisRequiredForPassing)%2ConDemandCourseMaterialItems.v2(name%2CoriginalName%2Cslug%2CtimeCommitment%2CcontentSummary%2CisLocked%2ClockableByItem%2CitemLockedReasonCode%2CtrackId%2ClockedStatus%2CitemLockSummary)%2ConDemandCourseMaterialTracks.v1(passablesCount)%2ConDemandGradingParameters.v1(gradedAssignmentGroups)%2CcontentAtomRelations.v1(embeddedContentSourceCourseId%2CsubContainerId)&showLockedItems=true`,
        {
          headers: {
            accept: "/",
            "accept-language": "en",
            "cache-control": "no-cache",
            pragma: "no-cache",
            priority: "u=1, i",
            "sec-ch-ua":
              '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": '"Android"',
          },
          referrerPolicy: "strict-origin-when-cross-origin",
          method: "GET",
          credentials: "include",
        }
      );

      const data = await response.json();
      let allItems = [];
      if (response.ok) {
        data.linked["onDemandCourseMaterialLessons.v1"].forEach((lesson) => {
          allItems = [...allItems, ...lesson.itemIds];
        });
        return { items: allItems, course_id: data.elements[0].id };
      }
      return null;
    } catch (error) {
      console.error("Error in getMaterialCourse:", error);
      return null;
    }
  }

  async function processItemsWithTimeout(material) {
    if (!material) {
      alert("Failed to get course materials");
      return;
    }

    const totalItems = material.items.length;
    let completedItems = 0;

    return new Promise((resolve) => {
      material.items.forEach((item, index) => {
        // Generate random delay between 1-3 seconds (1000-3000ms)
        const randomDelay = (Math.floor(Math.random() * 2000) + 500) * 0.3;

        setTimeout(async () => {
          try {
            await completeReading(item, material.course_id);
            await postAnswer(item, material.course_id);
            await applyEndedVideo(item, slug);

            completedItems++;
            console.log(
              `Processed item ${completedItems}/${totalItems} (delay: ${randomDelay}ms)`
            );

            if (completedItems === totalItems) {
              resolve();
            }
          } catch (error) {
            console.error(`Error processing item ${item}:`, error);
            completedItems++;
            if (completedItems === totalItems) {
              resolve();
            }
          }
        }, index * randomDelay); // Random delay between 1-3 seconds
      });
    });
  }

  const slug = window.location.pathname.split("/")[2];

  async function startAutoLearn() {
    try {
      console.log("Starting Auto Learn...");
      const material = await getMaterialCourse(slug);
      if (material) {
        console.log(`Found ${material.items.length} items to process`);
        await processItemsWithTimeout(material);
        console.log("All items have been processed successfully!");
        alert("All items have been processed successfully!");
      } else {
        console.error("Failed to get course materials");
        alert("Failed to get course materials");
      }
    } catch (error) {
      console.error("An error occurred:", error);
      alert("An error occurred while processing the course");
    }
  }

  // Khởi chạy auto learn
  startAutoLearn();
}

// Mã nguồn cho Auto Quiz
function autoQuizScript(apiKey) {
  // Script tự động làm quiz trên Coursera
  const API_KEY = apiKey;

  // Gemini API config
  const API_URL =
    "https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent";

  // Thông tin để ghi log
  const DEBUG = true;

  // Những từ khóa để phát hiện quiz
  const QUIZ_KEYWORDS = ["quiz", "graded", "assignment"];

  // Từ khóa để bỏ qua
  const SKIP_KEYWORDS = ["peer", "peer-graded"];

  // Trạng thái
  let moduleQueue = [];
  let currentModule = null;
  let processingQuiz = false;
  let moduleProcessingComplete = false;

  // Lưu trữ thông tin về các câu hỏi đã làm và đáp án sai để tránh chọn lại
  const STORAGE_KEY = "quiz_incorrect_answers";

  // Thêm các biến toàn cục này ở đầu IIFE của bạn, gần chỗ khai báo moduleQueue cũ
  let allAvailableModules = [];
  let currentModuleToProcess = null; // Object: {url, element, title, moduleNumber}

  // Helper function để lấy số thứ tự module từ URL (để sắp xếp)
  function extractModuleNumber(url) {
    const match = url.match(/\/module\/(\d+)/);
    return match ? parseInt(match[1], 10) : Infinity;
  }

  // Log với màu nếu Debug mode bật
  function log(message, type = "info") {
    if (!DEBUG) return;

    const styles = {
      info: "color: #3498db; font-weight: bold;",
      success: "color: #2ecc71; font-weight: bold;",
      warning: "color: #f39c12; font-weight: bold;",
      error: "color: #e74c3c; font-weight: bold;",
    };

    console.log(`%c[COURSERA-AUTO] ${message}`, styles[type] || styles.info);
  }

  // Các hàm giống như findAllModules, containsKeywords, shouldSkipQuiz...
  function findAllModules() {
    log("Đang tìm tất cả các module có thể click...");
    let modules = [];
    // Selector này cần nhắm đúng vào các link/button chuyển module chính của khóa học
    const moduleElements = document.querySelectorAll(
      'a[href*="/home/module/"]'
    );
    const uniqueUrls = new Set();

    moduleElements.forEach((link) => {
      const href = link.getAttribute("href").split("#")[0];
      if (href.includes("/home/module/") && !uniqueUrls.has(href)) {
        uniqueUrls.add(href);
        modules.push({
          url: href,
          element: link,
          title: link.textContent.trim() || href,
          moduleNumber: extractModuleNumber(href),
        });
      }
    });

    modules.sort((a, b) => a.moduleNumber - b.moduleNumber); // Sắp xếp theo số module
    modules.forEach((m) =>
      log(`Đã tìm thấy module: ${m.title} (URL: ${m.url})`, "info")
    );
    return modules;
  }

  // Kiểm tra xem một element có chứa bất kỳ từ khóa nào không
  function containsKeywords(element, keywords) {
    if (!element) return false;

    const text = element.textContent.toLowerCase();
    return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
  }

  // Kiểm tra xem một quiz có cần bỏ qua hay không
  function shouldSkipQuiz(quizElement) {
    return containsKeywords(quizElement, SKIP_KEYWORDS);
  }

  // Lấy ngưỡng đỗ (pass threshold) từ thông tin quiz
  function getPassThreshold(quizElement) {
    // Mặc định là 70%
    let threshold = 70;

    // Trong trang chi tiết quiz có thể có thông tin ngưỡng đỗ
    const passInfoText = quizElement.textContent;
    const passMatch = passInfoText.match(/need at least (\d+)%/);

    if (passMatch) {
      threshold = parseInt(passMatch[1]);
    }

    return threshold;
  }

  // Kiểm tra xem một quiz đã pass chưa
  function isQuizPassed(quizElement) {
    // Nếu có chứa "Failed", thì chắc chắn không pass
    if (quizElement.querySelector('[data-testid$="Failed"]')) {
      log("Quiz có trạng thái Failed", "warning");
      return false;
    }

    // Lấy ngưỡng đỗ cho quiz này
    const passThreshold = getPassThreshold(quizElement);

    // Kiểm tra xem có chứa điểm và lớn hơn hoặc bằng ngưỡng đỗ
    const gradeText = quizElement.textContent;
    const gradeMatch = gradeText.match(/Grade:\s*(\d+)%/);

    if (gradeMatch) {
      const grade = parseInt(gradeMatch[1]);
      if (grade >= passThreshold) {
        log(`Quiz đã pass với điểm: ${grade}% >= ${passThreshold}%`, "success");
        return true;
      } else {
        log(
          `Quiz không pass với điểm: ${grade}% < ${passThreshold}%`,
          "warning"
        );
        return false;
      }
    }

    return false;
  }

  // Kiểm tra xem một quiz có thể làm được không
  function isQuizAttemptable(quizElement) {
    // Kiểm tra xem có chứa trạng thái "Failed"
    const hasFailed =
      quizElement.querySelector('[data-testid$="Failed"]') !== null;
    if (hasFailed) {
      log("Đã tìm thấy quiz với trạng thái Failed", "warning");
      return true;
    }

    // Lấy ngưỡng đỗ cho quiz này
    const passThreshold = getPassThreshold(quizElement);

    // Kiểm tra xem có điểm dưới ngưỡng đỗ không
    const gradeText = quizElement.textContent;
    const gradeMatch = gradeText.match(/Grade:\s*(\d+)%/);
    if (gradeMatch && parseInt(gradeMatch[1]) < passThreshold) {
      log(
        `Quiz có điểm ${gradeMatch[1]}% < ${passThreshold}%, có thể làm lại`,
        "warning"
      );
      return true;
    }

    // Kiểm tra xem có nút "Start" hoặc "Resume" (hiển thị là "Grade: --")
    const hasEmptyGrade = gradeText.includes("Grade: --");
    if (hasEmptyGrade) {
      log("Quiz chưa làm (Grade: --), có thể làm", "info");
      return true;
    }

    return false;
  }

  // Tìm các quiz có thể làm trong module hiện tại
  function findAttemptableQuizzes() {
    log("Đang tìm các quiz có thể làm...");
    const attemptableQuizzes = [];

    // Tìm tất cả các liên kết trong module
    const allLinks = document.querySelectorAll("a");

    allLinks.forEach((link) => {
      // Kiểm tra xem liên kết có chứa từ khóa quiz hay không
      if (containsKeywords(link, QUIZ_KEYWORDS)) {
        // Kiểm tra xem có phải peer-graded hay không
        if (shouldSkipQuiz(link)) {
          log(`Bỏ qua quiz peer-graded: ${link.textContent}`, "warning");
          return;
        }

        // Kiểm tra xem quiz đã pass chưa
        if (!isQuizPassed(link)) {
          // Kiểm tra xem quiz có thể làm được không
          if (isQuizAttemptable(link)) {
            const href = link.getAttribute("href");
            if (href) {
              attemptableQuizzes.push({
                url: href,
                title: link.textContent.trim(),
                element: link,
              });
              log(
                `Đã tìm thấy quiz có thể làm: ${link.textContent.trim()}`,
                "info"
              );
            }
          }
        }
      }
    });

    return attemptableQuizzes;
  }

  // Xử lý module hiện tại: tìm tất cả các quiz cần làm và thực hiện
  function processCurrentModule() {
    if (processingQuiz || moduleProcessingComplete) return;

    // Kiểm tra xem có phải đang ở trang module không
    if (!window.location.href.includes("/home/module/")) {
      log("Không phải đang ở trang module, không thể xử lý!", "error");
      navigateToNextModule();
      return;
    }

    log("Bắt đầu xử lý module hiện tại...", "info");

    // Tìm các quiz có thể làm trong module hiện tại
    const quizzes = findAttemptableQuizzes();

    if (quizzes.length === 0) {
      log("Không tìm thấy quiz nào cần làm trong module này.", "warning");
      moduleProcessingComplete = true;
      navigateToNextModule();
      return;
    }

    // Bắt đầu làm quiz đầu tiên tìm được
    log(
      `Tìm thấy ${quizzes.length} quiz cần làm. Bắt đầu làm quiz đầu tiên...`,
      "success"
    );
    openAndStartQuiz(quizzes[0]);
  }

  // Di chuyển đến module tiếp theo
  function navigateToNextModule() {
    if (!allAvailableModules || allAvailableModules.length === 0) {
      log(
        "navigateToNextModule: Danh sách allAvailableModules rỗng. Thử tìm lại...",
        "warning"
      );
      allAvailableModules = findAllModules();
      if (!allAvailableModules || allAvailableModules.length === 0) {
        log(
          "Không có danh sách module nào để điều hướng sau khi thử lại.",
          "error"
        );
        currentModuleToProcess = null; // Đảm bảo reset nếu không còn module
        return;
      }
    }

    let nextModuleToProcess = null;

    if (currentModuleToProcess && currentModuleToProcess.url) {
      const currentIndex = allAvailableModules.findIndex(
        (m) => m.url === currentModuleToProcess.url
      );
      if (currentIndex !== -1) {
        if (currentIndex + 1 < allAvailableModules.length) {
          nextModuleToProcess = allAvailableModules[currentIndex + 1];
        } else {
          log(
            "Đã xử lý module cuối cùng hoặc không còn module nào.",
            "success"
          );
          currentModuleToProcess = null;
          processingQuiz = false;
          moduleProcessingComplete = true;
          return;
        }
      } else {
        log(
          `Module đang xử lý (${currentModuleToProcess.title}) không có trong danh sách. Thử module đầu tiên.`,
          "warning"
        );
        if (allAvailableModules.length > 0) {
          nextModuleToProcess = allAvailableModules[0];
        }
      }
    } else {
      log(
        "Không có module hiện tại làm tham chiếu. Thử điều hướng đến module đầu tiên.",
        "info"
      );
      if (allAvailableModules.length > 0) {
        nextModuleToProcess = allAvailableModules[0];
      }
    }

    if (nextModuleToProcess) {
      currentModuleToProcess = nextModuleToProcess;
      const targetUrl = currentModuleToProcess.url;
      moduleProcessingComplete = false;
      processingQuiz = false;

      let navigationTriggeredByClick = false;
      if (
        currentModuleToProcess.element &&
        document.body.contains(currentModuleToProcess.element)
      ) {
        log(
          `Đang click để di chuyển đến module: ${currentModuleToProcess.title} (URL: ${targetUrl})`,
          "info"
        );
        currentModuleToProcess.element.click();
        navigationTriggeredByClick = true;
      } else {
        log(
          `Phần tử DOM cho module ${currentModuleToProcess.title} không tìm thấy hoặc không hợp lệ. Sử dụng URL fallback: ${targetUrl}`,
          "warning"
        );
        window.location.href = targetUrl;
      }

      if (navigationTriggeredByClick) {
        log(
          `Đã click để điều hướng. Chờ module mới load và gọi lại startAutoQuiz sau 5 giây...`
        );
        setTimeout(() => {
          log("Hết thời gian chờ, gọi lại startAutoQuiz để xử lý module mới.");
          startAutoQuiz();
        }, 5000);
      }
    } else {
      log(
        "Không tìm thấy module tiếp theo để điều hướng hoặc đã xử lý hết.",
        "success"
      );
      currentModuleToProcess = null;
    }
  }

  // Mở và bắt đầu một quiz
  function openAndStartQuiz(quizInfo) {
    log(`Đang mở quiz: ${quizInfo.title}`, "info");
    processingQuiz = true;

    quizInfo.element.click(); // Click vào link quiz

    log("Đang đợi trang quiz load...", "info");

    // Kiểm tra định kỳ sự hiện diện của nút Start/Resume
    let attempts = 0;
    const maxAttempts = 7; // Tối đa 7 lần thử (14 giây)
    const intervalId = setInterval(() => {
      attempts++;
      log(`Tìm nút Resume/Start lần ${attempts}...`, "info");

      // Ưu tiên tìm nút Resume trước
      // Tìm nút có text chính xác là "Resume"
      const allButtons = Array.from(document.querySelectorAll("button"));
      const exactResumeButton = allButtons.find(
        (btn) => btn.textContent.trim() === "Resume"
      );

      if (exactResumeButton) {
        log("Tìm thấy nút chính xác với text 'Resume'", "success");
        clearInterval(intervalId);
        setTimeout(() => {
          log("Đang click nút Resume...", "info");
          exactResumeButton.click();

          // TODO: Sau khi click, cần xử lý các câu hỏi trong quiz
          // Hiện tại chỉ đơn giản đánh dấu đã hoàn thành để chuyển module
          setTimeout(() => {
            log("Đánh dấu quiz đã hoàn thành tạm thời", "success");
            processingQuiz = false;
            moduleProcessingComplete = true;
            navigateToNextModule();
          }, 5000);
        }, 1000);
        return;
      }

      // Tiếp theo, tìm trong các container cụ thể
      const actionContainer = document.querySelector(
        '.css-1fay0sq, div.action, [data-testid="CoverPageAction__controls"]'
      );
      if (actionContainer) {
        const resumeButtonInContainer = actionContainer.querySelector("button");
        if (
          resumeButtonInContainer &&
          resumeButtonInContainer.textContent.toLowerCase().includes("resume")
        ) {
          log("Tìm thấy nút Resume trong container action", "success");
          clearInterval(intervalId);
          setTimeout(() => {
            log("Đang click nút Resume trong container...", "info");
            resumeButtonInContainer.click();

            // TODO: Sau khi click, cần xử lý các câu hỏi trong quiz
            setTimeout(() => {
              log("Đánh dấu quiz đã hoàn thành tạm thời", "success");
              processingQuiz = false;
              moduleProcessingComplete = true;
              navigateToNextModule();
            }, 5000);
          }, 1000);
          return;
        }
      }

      // Tiếp theo, tìm nút Start
      const startSelectors = [
        'button[data-testid="start-button"]',
        'button[data-testid="StartButton"]',
        "button.cds-button-primary",
      ];

      for (const selector of startSelectors) {
        const startButton = document.querySelector(selector);
        if (
          startButton &&
          !startButton.disabled &&
          startButton.textContent.toLowerCase().includes("start")
        ) {
          log(
            `Đã tìm thấy nút Start với selector: "${selector}", đang click...`,
            "success"
          );
          clearInterval(intervalId);
          startButton.click();

          // TODO: Sau khi click, cần xử lý các câu hỏi trong quiz
          setTimeout(() => {
            log("Đánh dấu quiz đã hoàn thành tạm thời", "success");
            processingQuiz = false;
            moduleProcessingComplete = true;
            navigateToNextModule();
          }, 5000);
          return;
        }
      }

      // Cuối cùng, tìm nút có chứa từ "Resume"
      const resumeButton = allButtons.find((btn) =>
        btn.textContent.toLowerCase().includes("resume")
      );

      if (resumeButton) {
        log("Tìm thấy nút có chứa text 'Resume'", "success");
        clearInterval(intervalId);
        setTimeout(() => {
          log("Đang click nút Resume chứa text...", "info");
          resumeButton.click();

          // TODO: Sau khi click, cần xử lý các câu hỏi trong quiz
          setTimeout(() => {
            log("Đánh dấu quiz đã hoàn thành tạm thời", "success");
            processingQuiz = false;
            moduleProcessingComplete = true;
            navigateToNextModule();
          }, 5000);
        }, 1000);
        return;
      }

      // Nếu đã thử quá nhiều lần, dừng lại
      if (attempts >= maxAttempts) {
        log("Không tìm thấy nút Start hoặc Resume sau nhiều lần thử!", "error");
        clearInterval(intervalId);

        // Đánh dấu và chuyển sang module tiếp theo nếu không tìm thấy nút
        processingQuiz = false;
        moduleProcessingComplete = true;
        navigateToNextModule();
      }
    }, 2000); // Kiểm tra mỗi 2 giây
  }

  // Hàm bắt đầu tự động làm quiz
  function startAutoQuiz() {
    log("Bắt đầu/Tiếp tục tự động làm quiz...", "info");

    // Kiểm tra API Key
    if (!API_KEY) {
      alert(
        "API Key chưa được thiết lập. Vui lòng nhập API Key trong popup của extension."
      );
      return;
    }

    // Luôn lấy lại danh sách module mỗi khi hàm này được gọi
    allAvailableModules = findAllModules();

    if (allAvailableModules.length === 0) {
      if (
        window.location.href.includes("/assignment-submission/") ||
        window.location.href.includes("/quiz/")
      ) {
        log("Đang ở trang quiz/assignment. Chờ xử lý quiz hoàn tất...", "info");
        // Thêm logic để xử lý quiz ở đây
      } else {
        log(
          "Không tìm thấy module nào trên trang này. Script có thể đã bị dừng hoặc trang không hợp lệ.",
          "error"
        );
      }
      return;
    }
    log(
      `Tìm thấy ${allAvailableModules.length} module có thể click.`,
      "success"
    );

    const currentActualUrl = window.location.href;
    let identifiedModuleAsCurrent = allAvailableModules.find((m) =>
      currentActualUrl.includes(m.url)
    );

    // Ưu tiên currentModuleToProcess đã được set bởi navigateToNextModule
    if (
      currentModuleToProcess &&
      currentModuleToProcess.url &&
      currentActualUrl.includes(currentModuleToProcess.url)
    ) {
      // Đã ở đúng module được navigateToNextModule nhắm tới
      log(
        `Đã ở trang module đích: ${currentModuleToProcess.title}. Tiếp tục xử lý.`,
        "info"
      );
    } else if (identifiedModuleAsCurrent) {
      // Xác định module hiện tại dựa trên URL
      currentModuleToProcess = identifiedModuleAsCurrent;
      log(
        `Xác định module hiện tại dựa trên URL: ${currentModuleToProcess.title}. Bắt đầu xử lý.`,
        "info"
      );
      moduleProcessingComplete = false;
      processingQuiz = false;
    } else if (allAvailableModules.length > 0 && !currentModuleToProcess) {
      // Không khớp URL nào, và chưa có module nào được set -> đi đến module đầu tiên
      log(
        "Không khớp module nào và chưa có module đang xử lý. Điều hướng đến module đầu tiên.",
        "info"
      );
      currentModuleToProcess = allAvailableModules[0];
      moduleProcessingComplete = false;
      processingQuiz = false;
      if (currentModuleToProcess.element) {
        log(
          `Click để điều hướng đến module đầu tiên: ${currentModuleToProcess.title}`,
          "info"
        );
        currentModuleToProcess.element.click();
      } else {
        window.location.href = currentModuleToProcess.url;
      }
      return;
    } else if (!currentModuleToProcess && allAvailableModules.length === 0) {
      log("Không có module nào để xử lý.", "error");
      return;
    }

    // Nếu currentModuleToProcess đã được xác định, xử lý module đó
    if (currentModuleToProcess && currentModuleToProcess.url) {
      if (window.location.href.includes(currentModuleToProcess.url)) {
        processCurrentModule();
      } else {
        log(
          `URL (${window.location.href}) không khớp với module đang nhắm tới (${currentModuleToProcess.title}). Thử điều hướng lại.`,
          "warning"
        );
        if (currentModuleToProcess.element)
          currentModuleToProcess.element.click();
        else window.location.href = currentModuleToProcess.url;
      }
    } else {
      log("Không thể xác định module hiện tại để xử lý.", "error");
    }
  }

  // Khởi chạy auto quiz
  startAutoQuiz();
}
