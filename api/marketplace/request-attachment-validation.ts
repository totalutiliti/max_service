import { maximumPrivateImageBytes, validatePrivateImage } from "../storage/private-image-validation.js";

export const maximumRequestAttachmentBytes = maximumPrivateImageBytes;
export const maximumRequestAttachmentCount = 3;
export const validateRequestAttachment = validatePrivateImage;
