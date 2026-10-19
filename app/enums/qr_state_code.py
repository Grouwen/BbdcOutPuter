from enum import Enum


class QrStateCode(Enum):
    CONFIRM_LOGIN = 405
    WAIT_FOR_CONFIRM = 404
    CANCEL_LOGIN = 403
    QRCODE_TTL = 402
    SERVICE_ERROR = 500
    POLLING_TIMEOUT = 408