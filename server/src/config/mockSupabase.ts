import { randomUUID } from 'crypto';

// Shared in-memory database
const mockDb = {
  users: [] as any[],
  conversations: [] as any[],
  messages: [] as any[],
  blocked_users: [] as any[]
};

class MockSupabaseQueryBuilder {
  private tableName: string;
  private filters: ((item: any) => boolean)[] = [];
  private sortField: string | null = null;
  private sortAscending: boolean = true;
  private limitCount: number | null = null;
  private rangeStart: number | null = null;
  private rangeEnd: number | null = null;
  private payload: any = null;
  private queryType: 'select' | 'insert' | 'update' | 'delete' = 'select';

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(columns: string = '*') {
    if (this.queryType !== 'insert' && this.queryType !== 'update' && this.queryType !== 'delete') {
      this.queryType = 'select';
    }
    return this;
  }

  insert(data: any | any[]) {
    this.queryType = 'insert';
    this.payload = data;
    return this;
  }

  update(data: any) {
    this.queryType = 'update';
    this.payload = data;
    return this;
  }

  delete() {
    this.queryType = 'delete';
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push((item) => item[column] === value);
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push((item) => item[column] !== value);
    return this;
  }

  in(column: string, values: any[]) {
    this.filters.push((item) => values.includes(item[column]));
    return this;
  }

  or(filterStr: string) {
    // e.g. "email.eq.alice@example.com,username.eq.alice"
    const parts = filterStr.split(',');
    this.filters.push((item) => {
      return parts.some(part => {
        const match = part.trim().match(/^([^.]+)\.([^.]+)\.(.+)$/);
        if (match) {
          const [_, col, op, val] = match;
          if (op === 'eq') {
            return item[col] === val;
          }
        }
        return false;
      });
    });
    return this;
  }

  contains(column: string, values: any[]) {
    this.filters.push((item) => {
      const arr = item[column];
      if (!Array.isArray(arr)) return false;
      return values.every(v => arr.includes(v));
    });
    return this;
  }

  ilike(column: string, pattern: string) {
    const searchVal = pattern.replace(/%/g, '').toLowerCase();
    this.filters.push((item) => {
      const text = item[column];
      if (typeof text !== 'string') return false;
      return text.toLowerCase().includes(searchVal);
    });
    return this;
  }

  order(column: string, { ascending = true } = {}) {
    this.sortField = column;
    this.sortAscending = ascending;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number) {
    this.rangeStart = from;
    this.rangeEnd = to;
    return this;
  }

  private resolveJoins(item: any) {
    if (this.tableName === 'conversations') {
      const copy = { ...item };
      // populate participants details
      if (Array.isArray(copy.participants)) {
        copy.participants_details = copy.participants.map((pid: string) => {
          return mockDb.users.find((u) => u.id === pid);
        }).filter(Boolean);
      }
      // populate last message details
      if (copy.last_message_id) {
        const msg = mockDb.messages.find((m) => m.id === copy.last_message_id);
        if (msg) {
          copy.last_message_details = {
            ...msg,
            sender_details: mockDb.users.find((u) => u.id === msg.sender_id)
          };
        }
      }
      return copy;
    }

    if (this.tableName === 'messages') {
      const copy = { ...item };
      // populate sender details
      if (copy.sender_id) {
        copy.sender_details = mockDb.users.find((u) => u.id === copy.sender_id);
      }
      // populate reply_to details
      if (copy.reply_to_id) {
        const rMsg = mockDb.messages.find((m) => m.id === copy.reply_to_id);
        if (rMsg) {
          copy.reply_to_details = {
            ...rMsg,
            sender_details: mockDb.users.find((u) => u.id === rMsg.sender_id)
          };
        }
      }
      return copy;
    }

    return item;
  }

  private execute() {
    const list = (mockDb as any)[this.tableName];
    if (!list) {
      return { data: null, error: { message: `Table ${this.tableName} not found` } };
    }

    if (this.queryType === 'insert') {
      const isArray = Array.isArray(this.payload);
      const itemsToInsert = isArray ? this.payload : [this.payload];
      const insertedItems = itemsToInsert.map((item: any) => {
        const newItem = {
          id: item.id || randomUUID(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...item
        };

        if (this.tableName === 'users') {
          if (newItem.bio === undefined) newItem.bio = 'Hey there! I am using Altma Chat.';
          if (newItem.avatar_url === undefined) newItem.avatar_url = '';
          if (newItem.is_verified === undefined) newItem.is_verified = false;
          if (newItem.status === undefined) newItem.status = 'offline';
          if (newItem.privacy_settings === undefined) newItem.privacy_settings = { lastSeen: 'everyone', profilePhoto: 'everyone' };
        } else if (this.tableName === 'conversations') {
          if (newItem.pinned_by === undefined) newItem.pinned_by = [];
          if (newItem.archived_by === undefined) newItem.archived_by = [];
          if (newItem.e2e_enabled === undefined) newItem.e2e_enabled = false;
        } else if (this.tableName === 'messages') {
          if (newItem.message_type === undefined) newItem.message_type = 'text';
          if (newItem.delivered_to === undefined) newItem.delivered_to = [];
          if (newItem.read_by === undefined) newItem.read_by = [];
          if (newItem.deleted_for === undefined) newItem.deleted_for = [];
          if (newItem.deleted_for_all === undefined) newItem.deleted_for_all = false;
          if (newItem.is_edited === undefined) newItem.is_edited = false;
          if (newItem.is_forwarded === undefined) newItem.is_forwarded = false;
        }
        list.push(newItem);
        return this.resolveJoins(newItem);
      });

      return { data: isArray ? insertedItems : insertedItems[0], error: null };
    }

    let filteredList = [...list];
    for (const filter of this.filters) {
      filteredList = filteredList.filter(filter);
    }

    if (this.queryType === 'update') {
      filteredList.forEach((item) => {
        Object.assign(item, this.payload);
        item.updated_at = new Date().toISOString();
      });
      const resolvedList = filteredList.map(item => this.resolveJoins(item));
      return { data: resolvedList, error: null };
    }

    if (this.queryType === 'delete') {
      filteredList.forEach((item) => {
        const index = list.indexOf(item);
        if (index > -1) {
          list.splice(index, 1);
        }
      });
      const resolvedList = filteredList.map(item => this.resolveJoins(item));
      return { data: resolvedList, error: null };
    }

    // Sort
    if (this.sortField) {
      filteredList.sort((a, b) => {
        const valA = a[this.sortField!];
        const valB = b[this.sortField!];
        if (valA < valB) return this.sortAscending ? -1 : 1;
        if (valA > valB) return this.sortAscending ? 1 : -1;
        return 0;
      });
    }

    // Limit / Range
    if (this.rangeStart !== null && this.rangeEnd !== null) {
      filteredList = filteredList.slice(this.rangeStart, this.rangeEnd + 1);
    } else if (this.limitCount !== null) {
      filteredList = filteredList.slice(0, this.limitCount);
    }

    const resolvedList = filteredList.map(item => this.resolveJoins(item));
    return { data: resolvedList, error: null };
  }

  async single() {
    const res = this.execute();
    if (res.error) return res;
    if (!res.data || res.data.length === 0) {
      return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
    }
    return { data: Array.isArray(res.data) ? res.data[0] : res.data, error: null };
  }

  then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    const res = this.execute();
    return Promise.resolve(res).then(onfulfilled, onrejected);
  }
}

export const mockSupabase = {
  from(tableName: string) {
    return new MockSupabaseQueryBuilder(tableName);
  }
};
