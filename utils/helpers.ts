
export class Helpers {

  // Generate unique email for test data
  static generateEmail(): string {
    return `qa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`;
  }

  // Generate unique reference ID
  static generateReferenceId(): string {
    return `QA-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // Format date as YYYY-MM-DD using local time
  static formatDate(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}
