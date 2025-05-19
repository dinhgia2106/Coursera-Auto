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
    console.error("[ContentScript-Autolearn] Error in applyEndedVideo:", error);
    sendErrorToBackground("applyEndedVideo", error.message);
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
    console.error("[ContentScript-Autolearn] Error in completeReading:", error);
    sendErrorToBackground("completeReading", error.message);
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
    console.error("[ContentScript-Autolearn] Error in getQuestionId:", error);
    // This error might not be critical for autolearn, so don't send to background unless necessary
    return null;
  }
}

async function postAnswer(itemId, course_id) {
  try {
    const questionId = await getQuestionId(itemId, course_id);
    if (!questionId) return false; // If no questionId, it might be a video or reading, not a discussion

    const payload = {
      content: {
        typeName: "cml",
        definition: {
          dtdId: "discussion/1",
          value:
            "<co-content><text>Thank you for the information!</text></co-content>", // Generic answer
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
    console.error("[ContentScript-Autolearn] Error in postAnswer:", error);
    // This error might not be critical, especially if getQuestionId returned null
    // sendErrorToBackground("postAnswer", error.message);
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
    if (
      response.ok &&
      data.linked &&
      data.linked["onDemandCourseMaterialLessons.v1"]
    ) {
      data.linked["onDemandCourseMaterialLessons.v1"].forEach((lesson) => {
        allItems = [...allItems, ...lesson.itemIds];
      });
      return { items: allItems, course_id: data.elements[0].id };
    }
    sendErrorToBackground(
      "getMaterialCourse",
      "Không thể lấy danh sách bài học hoặc cấu trúc dữ liệu API thay đổi."
    );
    return null;
  } catch (error) {
    console.error(
      "[ContentScript-Autolearn] Error in getMaterialCourse:",
      error
    );
    sendErrorToBackground("getMaterialCourse", error.message);
    return null;
  }
}

let stopScript = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "STOP_SCRIPT") {
    console.log("[ContentScript-Autolearn] Received STOP_SCRIPT command.");
    stopScript = true;
    sendResponse({ status: "Stopping Autolearn" });
  }
  return true; // Keep the message channel open for asynchronous response
});

function sendProgressToBackground(
  completedItems,
  totalItems,
  currentItemName = "N/A"
) {
  const progress =
    totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  chrome.runtime.sendMessage({
    type: "AUTOLERN_PROGRESS",
    progress: progress,
    status: `Đã xử lý ${completedItems}/${totalItems} items. Hiện tại: ${currentItemName}`,
    currentTask: `Item ${completedItems}/${totalItems}`,
  });
}

function sendErrorToBackground(stage, errorMsg) {
  console.error(`[ContentScript-Autolearn] Error at ${stage}: ${errorMsg}`);
  chrome.runtime.sendMessage({
    type: "PROCESS_ERROR",
    stage: "autolearn",
    error: `Lỗi tại ${stage}: ${errorMsg}`,
  });
}

async function processItemsWithTimeout(material, slug) {
  if (!material || !material.items || material.items.length === 0) {
    const errorMsg =
      "Không tìm thấy tài liệu khóa học hoặc không có item nào để xử lý.";
    console.error("[ContentScript-Autolearn]", errorMsg);
    sendErrorToBackground("processItemsWithTimeout", errorMsg);
    chrome.runtime.sendMessage({ type: "AUTOLERN_DONE" }); // Notify completion even on error to proceed or stop
    return;
  }

  const totalItems = material.items.length;
  let completedItems = 0;
  console.log(`[ContentScript-Autolearn] Bắt đầu xử lý ${totalItems} items.`);
  sendProgressToBackground(completedItems, totalItems, "Bắt đầu");

  for (let i = 0; i < totalItems; i++) {
    if (stopScript) {
      console.log("[ContentScript-Autolearn] Dừng xử lý do yêu cầu.");
      sendProgressToBackground(completedItems, totalItems, "Đã dừng");
      // Không gửi AUTOLERN_DONE ở đây, background sẽ xử lý trạng thái dừng
      return;
    }

    const item = material.items[i];
    const randomDelay = (Math.floor(Math.random() * 2000) + 500) * 0.3; // Delay đã giảm

    try {
      // Cố gắng lấy tên item để log đẹp hơn (nếu có, không thì dùng ID)
      // Đây là một ví dụ, bạn cần điều chỉnh dựa trên cấu trúc data.linked['onDemandCourseMaterialItems.v2']
      // const itemDetails = material.course_items_details?.find(it => it.id === item);
      // const itemName = itemDetails ? itemDetails.name : item;
      const itemName = item; // Tạm thời dùng item ID

      console.log(
        `[ContentScript-Autolearn] Đang xử lý item ${
          i + 1
        }/${totalItems}: ${itemName} (delay: ${randomDelay}ms)`
      );
      sendProgressToBackground(completedItems, totalItems, itemName);

      await completeReading(item, material.course_id);
      await postAnswer(item, material.course_id); // Có thể thất bại nếu không phải discussion
      await applyEndedVideo(item, slug);

      completedItems++;
      console.log(
        `[ContentScript-Autolearn] Hoàn thành item ${completedItems}/${totalItems}: ${itemName}`
      );
      sendProgressToBackground(completedItems, totalItems, itemName);

      if (i < totalItems - 1) {
        // Chỉ delay nếu không phải item cuối
        await new Promise((resolve) => setTimeout(resolve, randomDelay));
      }
    } catch (error) {
      console.error(
        `[ContentScript-Autolearn] Lỗi khi xử lý item ${item}:`,
        error
      );
      sendErrorToBackground(`processing item ${item}`, error.message);
      // Có thể quyết định dừng hẳn hoặc bỏ qua item lỗi và tiếp tục
      // Hiện tại: bỏ qua và tiếp tục
      completedItems++; // Vẫn tăng để tiến trình không bị kẹt
      sendProgressToBackground(completedItems, totalItems, `Lỗi với ${item}`);
    }
  }
  if (!stopScript) {
    console.log("[ContentScript-Autolearn] Tất cả các items đã được xử lý.");
    chrome.runtime.sendMessage({ type: "AUTOLERN_DONE" });
  }
}

// Main execution for content_autolearn.js
(async () => {
  console.log("[ContentScript-Autolearn] Script đang chạy...");
  const slug = window.location.pathname.split("/")[2];
  if (!slug) {
    sendErrorToBackground("initialization", "Không thể lấy slug từ URL.");
    chrome.runtime.sendMessage({ type: "AUTOLERN_DONE" }); // Để không bị kẹt
    return;
  }

  try {
    const material = await getMaterialCourse(slug);
    if (material && material.items) {
      console.log(
        `[ContentScript-Autolearn] Tìm thấy ${material.items.length} items để xử lý cho slug: ${slug}`
      );
      await processItemsWithTimeout(material, slug);
    } else {
      const msg = `Không lấy được tài liệu khóa học cho slug: ${slug}. Có thể bạn không ở trang khóa học chính.`;
      console.warn("[ContentScript-Autolearn]", msg);
      sendErrorToBackground("getMaterialCourse", msg);
      chrome.runtime.sendMessage({ type: "AUTOLERN_DONE" }); // Để không bị kẹt
    }
  } catch (error) {
    console.error(
      "[ContentScript-Autolearn] Lỗi nghiêm trọng trong quá trình thực thi chính:",
      error
    );
    sendErrorToBackground("main execution", error.message);
    chrome.runtime.sendMessage({ type: "AUTOLERN_DONE" }); // Để không bị kẹt
  }
})();
