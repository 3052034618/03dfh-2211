import { Controller, Post, Body, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ReceiptService, ReceiptResult } from './receipt.service';
import { CreateReceiptDto, QueryReceiptDto } from './dto/receipt.dto';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { Receipt } from '@prisma/client';
import { ReceiptStatus, RECEIPT_STATUS_VALUES } from '../../common/types/alert.types';

@ApiTags('处置回执')
@Controller('receipts')
export class ReceiptController {
  constructor(private readonly receiptService: ReceiptService) {}

  @Get(':alertId')
  @ApiOperation({ summary: '获取告警详情页（用于通知链接跳转）' })
  async getReceiptPage(@Param('alertId') alertId: string) {
    const alert = await this.receiptService.getAlertWithReceipts(alertId);
    return {
      alert,
      receiptStatuses: RECEIPT_STATUS_VALUES,
    };
  }

  @Post()
  @ApiOperation({ summary: '提交处置回执' })
  create(@Body() dto: CreateReceiptDto): Promise<ReceiptResult> {
    return this.receiptService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '查询回执列表' })
  findAll(
    @Query() query: QueryReceiptDto,
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedResponse<Receipt>> {
    return this.receiptService.findAll(query, pagination);
  }

  @Get('detail/:id')
  @ApiOperation({ summary: '获取单个回执详情' })
  findOne(@Param('id') id: string): Promise<Receipt> {
    return this.receiptService.findOne(id);
  }

  @Get('alert/:alertId/detail')
  @ApiOperation({ summary: '获取告警及其所有回执' })
  getAlertWithReceipts(@Param('alertId') alertId: string) {
    return this.receiptService.getAlertWithReceipts(alertId);
  }
}
