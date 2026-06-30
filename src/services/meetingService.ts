import { db, pool } from "../db/index.js";

export interface MeetingInput {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  attendees: string[];
}

export class MeetingService {
  static async create(meeting: MeetingInput, organizationId?: string | null) {
    const id = `m${Date.now()}`;
    const client = await pool.connect();
    try {
      await client.query("BEGIN;");

      const { rows } = await client.query(
        `INSERT INTO meetings (id, title, date, start_time, end_time, organization_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *;`,
        [
          id,
          meeting.title,
          meeting.date,
          meeting.startTime,
          meeting.endTime,
          organizationId || null,
        ],
      );
      const created = rows[0];

      if (meeting.attendees && meeting.attendees.length > 0) {
        for (const memberId of meeting.attendees) {
          await client.query(
            "INSERT INTO meeting_attendees (meeting_id, member_id) VALUES ($1, $2);",
            [id, memberId],
          );
        }
      }

      await client.query("COMMIT;");
      return {
        id: created.id,
        title: created.title,
        date: created.date,
        startTime: created.start_time,
        endTime: created.end_time,
        attendees: meeting.attendees || [],
      };
    } catch (error) {
      await client.query("ROLLBACK;");
      throw error;
    } finally {
      client.release();
    }
  }

  static async update(
    id: string,
    patch: Partial<MeetingInput>,
    organizationId?: string | null,
  ) {
    if (!organizationId) return null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN;");

      const { rows: checkRows } = await client.query(
        "SELECT id FROM meetings WHERE id = $1 AND organization_id = $2;",
        [id, organizationId],
      );
      if (!checkRows[0]) {
        await client.query("ROLLBACK;");
        return null;
      }

      const fieldsToUpdate: string[] = [];
      const values: any[] = [];
      let index = 1;

      if (patch.title !== undefined) {
        fieldsToUpdate.push(`title = $${index++}`);
        values.push(patch.title);
      }
      if (patch.date !== undefined) {
        fieldsToUpdate.push(`date = $${index++}`);
        values.push(patch.date);
      }
      if (patch.startTime !== undefined) {
        fieldsToUpdate.push(`start_time = $${index++}`);
        values.push(patch.startTime);
      }
      if (patch.endTime !== undefined) {
        fieldsToUpdate.push(`end_time = $${index++}`);
        values.push(patch.endTime);
      }

      let updatedMeeting: any;
      if (fieldsToUpdate.length > 0) {
        values.push(id, organizationId);
        const query = `UPDATE meetings SET ${fieldsToUpdate.join(", ")} WHERE id = $${index} AND organization_id = $${index + 1} RETURNING *;`;
        const { rows } = await client.query(query, values);
        updatedMeeting = rows[0];
      } else {
        const { rows } = await client.query(
          "SELECT * FROM meetings WHERE id = $1 AND organization_id = $2;",
          [id, organizationId],
        );
        updatedMeeting = rows[0];
      }

      if (!updatedMeeting) {
        await client.query("ROLLBACK;");
        return null;
      }

      if (patch.attendees !== undefined) {
        await client.query(
          "DELETE FROM meeting_attendees WHERE meeting_id = $1;",
          [id],
        );
        for (const memberId of patch.attendees) {
          await client.query(
            "INSERT INTO meeting_attendees (meeting_id, member_id) VALUES ($1, $2);",
            [id, memberId],
          );
        }
      }

      // Fetch final list of attendees
      const attendeesRes = await client.query(
        "SELECT member_id FROM meeting_attendees WHERE meeting_id = $1;",
        [id],
      );
      const attendees = attendeesRes.rows.map((r) => r.member_id);

      await client.query("COMMIT;");
      return {
        id: updatedMeeting.id,
        title: updatedMeeting.title,
        date: updatedMeeting.date,
        startTime: updatedMeeting.start_time,
        endTime: updatedMeeting.end_time,
        attendees,
      };
    } catch (error) {
      await client.query("ROLLBACK;");
      throw error;
    } finally {
      client.release();
    }
  }

  static async delete(id: string, organizationId?: string | null) {
    if (!organizationId) return null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN;");

      const attendeesRes = await client.query(
        `SELECT ma.member_id 
         FROM meeting_attendees ma
         JOIN meetings m ON ma.meeting_id = m.id
         WHERE ma.meeting_id = $1 AND m.organization_id = $2;`,
        [id, organizationId],
      );
      const attendees = attendeesRes.rows.map((r) => r.member_id);

      const { rows } = await client.query(
        "DELETE FROM meetings WHERE id = $1 AND organization_id = $2 RETURNING *;",
        [id, organizationId],
      );
      const deleted = rows[0];

      await client.query("COMMIT;");
      if (!deleted) return null;
      return {
        id: deleted.id,
        title: deleted.title,
        date: deleted.date,
        startTime: deleted.start_time,
        endTime: deleted.end_time,
        attendees,
      };
    } catch (error) {
      await client.query("ROLLBACK;");
      throw error;
    } finally {
      client.release();
    }
  }
}
