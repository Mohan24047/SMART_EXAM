import hashlib
import secrets
import uuid
import os
from typing import Optional, Dict, Any
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import analytics

# Zero-dependency auth logic using standard lib hashlib
# We use PBKDF2 with SHA256 for secure enough local storage hashing
SALT_PARAMS: Dict[str, Any] = {
    'iterations': 100000,
    'hash_name': 'sha256'
}

security = HTTPBearer(auto_error=False)

def hash_password(password: str, salt: Optional[bytes] = None) -> str:
    """Hash a password using PBKDF2."""
    if salt is None:
        salt = os.urandom(32)
    key = hashlib.pbkdf2_hmac(
        SALT_PARAMS['hash_name'],
        password.encode('utf-8'),
        salt,
        SALT_PARAMS['iterations']
    )
    return salt.hex() + ':' + key.hex()

def verify_password(password: str, hashed: str) -> bool:
    """Verify a plain password against a stored hash string."""
    try:
        salt_hex, key_hex = hashed.split(':')
        salt = bytes.fromhex(salt_hex)
        expected_key = bytes.fromhex(key_hex)
        key = hashlib.pbkdf2_hmac(
            SALT_PARAMS['hash_name'],
            password.encode('utf-8'),
            salt,
            SALT_PARAMS['iterations']
        )
        return secrets.compare_digest(key, expected_key)
    except Exception:
        return False

# ──────────────────────────────────────────────────────────────────────────────
# User Auth DAO Functions
# ──────────────────────────────────────────────────────────────────────────────

def create_user(name: str, email: str, plain_password: str) -> Dict[str, Any]:
    """Create a new user, throw exception if email exists."""
    conn = analytics.get_connection()
    cursor = conn.cursor()
    
    # Check if exists
    cursor.execute("SELECT id FROM users WHERE email = ?", (email.lower(),))
    if cursor.fetchone():
        conn.close()
        raise ValueError("Email already registered")
        
    hashed_pw = hash_password(plain_password)
    
    user_id = str(uuid.uuid4())
    
    cursor.execute('''
        INSERT INTO users (id, name, email, password_hash)
        VALUES (?, ?, ?, ?)
    ''', (user_id, name, email.lower(), hashed_pw))
    
    conn.commit()
    conn.close()
    
    return {"id": user_id, "name": name, "email": email.lower()}

def authenticate_user(email: str, plain_password: str) -> Optional[Dict[str, Any]]:
    """Verify credentials and return user dict with a new session token, or None."""
    conn = analytics.get_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM users WHERE email = ?", (email.lower(),))
    user = cursor.fetchone()
    
    if not user:
        conn.close()
        return None
        
    if not verify_password(plain_password, user['password_hash']):
        conn.close()
        return None
        
    # Generate new session token
    session_token = str(uuid.uuid4())
    cursor.execute("UPDATE users SET session_token = ? WHERE id = ?", (session_token, user['id']))
    conn.commit()
    
    user_data = dict(user)
    user_data.pop('password_hash') # Dont return hash
    user_data['session_token'] = session_token
    

    conn.close()
    return user_data

def clear_session(token: str):
    """Log out a user by clearing their token."""
    if not token:
        return
    conn = analytics.get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET session_token = NULL WHERE session_token = ?", (token,))
    conn.commit()
    conn.close()

def get_user_by_token(token: str) -> Optional[Dict[str, Any]]:
    """Retrieve user dictionary given a valid session token."""
    if not token:
        return None
        
    conn = analytics.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, email FROM users WHERE session_token = ?", (token,))
    user = cursor.fetchone()
    conn.close()
    

    
    if user:
        return dict(user)
    return None

def get_current_user_optional(credentials: HTTPAuthorizationCredentials = Security(security)) -> Optional[Dict[str, Any]]:
    """FastAPI Dependency: Returns current user dict if valid token is provided, else None. Does NOT throw error."""
    if not credentials:
        return None
    token = credentials.credentials
    user = get_user_by_token(token)
    return user

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> Dict[str, Any]:
    """FastAPI Dependency: Returns current user dict if valid token, else throws 401."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Missing authorization token")
    token = credentials.credentials
    user = get_user_by_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid authorization token")
    return user
