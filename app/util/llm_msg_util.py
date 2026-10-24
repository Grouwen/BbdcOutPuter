def user_msg(content: str) -> dict:
    return {"role": "user", "content": content}

def assistant_msg(content: str) -> dict:
    return {"role": "assistant", "content": content}

def system_msg(content: str) -> dict:
    return {"role": "system", "content": content}